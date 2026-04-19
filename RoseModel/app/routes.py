import json
import os
import time

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from app.models import (
    CompressRequest,
    CompressResponse,
    GenerateDone,
    GenerateRequest,
    Message,
    ToolCallResult,
    UsageInfo,
)
from app.conversation_log import get_conversations, log_turn
from app.observability import emit, forget_trace, new_trace_id
from app import providers
from app.skills import get_skill_content, load_skills, select_skills
from app.knowledge import retrieve_knowledge
from app.tools import execute_tool_call

router = APIRouter()

MAX_ITERATIONS = 100
AGENT_MD_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "agent.md")


def _load_internal_agent_md() -> str:
    path = os.path.normpath(AGENT_MD_PATH)
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    return ""


def _build_system_prompt(
    client_agent_md: str | None,
    skill_content: str,
    knowledge_content: str,
) -> str:
    parts = []

    internal = _load_internal_agent_md()
    if internal:
        parts.append(internal)

    if client_agent_md:
        parts.append(f"## Client Instructions\n\n{client_agent_md}")

    if skill_content:
        parts.append(skill_content)

    if knowledge_content:
        parts.append(knowledge_content)

    return "\n\n".join(parts)


def _tools_to_dicts(tools) -> list[dict]:
    """Convert Tool pydantic models to the dict shape providers.chat_stream expects."""
    result = []
    for t in tools:
        params = {}
        for pname, pinfo in t.parameters.items():
            params[pname] = {"type": pinfo.type, "description": pinfo.description}
        result.append({
            "name": t.name,
            "description": t.description,
            "parameters": params,
        })
    return result


async def _compress_messages(messages: list[dict]) -> list[dict]:
    """Compress conversation by summarizing the first half."""
    if len(messages) <= 2:
        return messages

    mid = len(messages) // 2
    first_half = messages[:mid]
    second_half = messages[mid:]

    summary_prompt = [
        {
            "role": "system",
            "content": (
                "Summarize the following conversation concisely. Preserve key facts, "
                "decisions, code snippets, and context that would be needed to continue "
                "the conversation. Return only the summary, no preamble."
            ),
        },
        {"role": "user", "content": json.dumps(first_half)},
    ]

    response = await providers.chat_sync(summary_prompt, role="compression")
    summary = response.get("content", "") or ""

    return [
        {"role": "system", "content": f"Summary of prior conversation:\n\n{summary}"},
        *second_half,
    ]


@router.post("/generate")
async def generate(request: GenerateRequest, http_request: Request):
    trace_id = getattr(http_request.state, "trace_id", None) or new_trace_id()
    t0 = time.perf_counter()

    load_skills()

    messages = [m.model_dump() for m in request.messages]

    last_user_msg = ""
    for m in reversed(messages):
        if m["role"] == "user":
            last_user_msg = m["content"]
            break

    tools_supported = providers.supports_tools("chat")

    emit(
        "request_start",
        {
            "endpoint": "/generate",
            "messages_count": len(messages),
            "last_user_content": last_user_msg[:2048],
            "agent_md": (request.agent_md or "")[:2048],
            "tools": [
                {"name": t.name, "description": t.description} for t in request.tools
            ],
            "tools_supported": tools_supported,
        },
        trace_id,
    )

    selected_category_names = await select_skills(messages)
    skill_content = get_skill_content(selected_category_names)

    knowledge_content = await retrieve_knowledge(last_user_msg)

    system_prompt = _build_system_prompt(
        request.agent_md, skill_content, knowledge_content
    )

    emit(
        "prompt_built",
        {
            "system_prompt": system_prompt[:16384],
            "selected_categories": list(selected_category_names),
            "knowledge_chars": len(knowledge_content or ""),
            "knowledge_preview": (knowledge_content or "")[:4096],
        },
        trace_id,
    )

    tool_dicts = _tools_to_dicts(request.tools) if request.tools else []
    effective_tools = tool_dicts if (tool_dicts and tools_supported) else None

    tool_calls_made: list[ToolCallResult] = []
    context_warning = False
    total_usage = UsageInfo()

    async def event_generator():
        nonlocal context_warning, tool_calls_made, total_usage

        conversation = [
            {"role": "system", "content": system_prompt},
            *messages,
        ]

        final_response = ""
        final_status = "ok"

        try:
            for iteration in range(MAX_ITERATIONS):
                accumulated_content = ""
                pending_tool_call: dict | None = None

                async for chunk in providers.chat_stream(
                    conversation,
                    tools=effective_tools,
                ):
                    if chunk.get("usage"):
                        u = chunk["usage"]
                        total_usage.prompt_tokens += int(u.get("prompt_tokens") or 0)
                        total_usage.completion_tokens += int(u.get("completion_tokens") or 0)

                    tc = chunk.get("tool_call")
                    if tc is not None:
                        pending_tool_call = tc
                        emit(
                            "tool_call",
                            {
                                "iteration": iteration,
                                "tool": tc["name"],
                                "params": tc["arguments"],
                            },
                            trace_id,
                        )
                        yield {
                            "event": "tool_call",
                            "data": json.dumps({
                                "tool": tc["name"],
                                "params": tc["arguments"],
                            }),
                        }

                    content = chunk.get("content")
                    if content:
                        accumulated_content += content
                        yield {
                            "event": "token",
                            "data": json.dumps({"content": content}),
                        }

                if pending_tool_call is not None:
                    tc_name = pending_tool_call["name"]
                    tc_params = pending_tool_call["arguments"]

                    result = await execute_tool_call(tc_name, tc_params, request.tools)

                    tool_calls_made.append(ToolCallResult(
                        tool=tc_name,
                        params=tc_params if isinstance(tc_params, dict) else {"_raw": tc_params},
                        success=result["success"],
                        content=result["content"],
                        error=result["error"],
                    ))

                    emit(
                        "tool_result",
                        {
                            "tool": tc_name,
                            "success": result["success"],
                            "content": (result["content"] or "")[:8192] if result.get("content") else None,
                            "error": result["error"],
                        },
                        trace_id,
                    )

                    yield {
                        "event": "tool_result",
                        "data": json.dumps({
                            "tool": tc_name,
                            "success": result["success"],
                            "content": result["content"],
                            "error": result["error"],
                        }),
                    }

                    conversation.append({
                        "role": "assistant",
                        "content": accumulated_content,
                        "tool_calls": [{
                            "id": pending_tool_call["id"],
                            "type": "function",
                            "function": {
                                "name": tc_name,
                                "arguments": json.dumps(tc_params)
                                    if isinstance(tc_params, (dict, list))
                                    else str(tc_params),
                            },
                        }],
                    })
                    conversation.append({
                        "role": "tool",
                        "tool_call_id": pending_tool_call["id"],
                        "content": json.dumps(result),
                    })

                    if len(conversation) > 40:
                        conversation = await _compress_messages(conversation)
                        context_warning = True
                        yield {"event": "context_warning", "data": "{}"}

                    continue

                final_response = accumulated_content
                done_data = GenerateDone(
                    tool_calls_made=tool_calls_made,
                    context_warning=context_warning,
                    usage=total_usage,
                    tools_supported=tools_supported,
                )
                yield {"event": "done", "data": done_data.model_dump_json()}
                return

            # Hit max iterations — force a final summary pass
            final_status = "max_iterations"
            conversation.append({
                "role": "user",
                "content": "Please summarize what you have accomplished and what remains to be done.",
            })

            summary_text = ""
            async for chunk in providers.chat_stream(conversation):
                content = chunk.get("content")
                if content:
                    summary_text += content
                    yield {
                        "event": "token",
                        "data": json.dumps({"content": content}),
                    }
                if chunk.get("usage"):
                    u = chunk["usage"]
                    total_usage.prompt_tokens += int(u.get("prompt_tokens") or 0)
                    total_usage.completion_tokens += int(u.get("completion_tokens") or 0)
            final_response = summary_text

            done_data = GenerateDone(
                tool_calls_made=tool_calls_made,
                context_warning=context_warning,
                usage=total_usage,
                tools_supported=tools_supported,
            )
            yield {"event": "done", "data": done_data.model_dump_json()}
        except Exception as e:
            final_status = "error"
            emit(
                "request_end",
                {
                    "status": "error",
                    "endpoint": "/generate",
                    "error": str(e),
                    "context_warning": context_warning,
                    "tool_calls_count": len(tool_calls_made),
                    "usage": total_usage.model_dump(),
                    "final_response": final_response[:16384],
                },
                trace_id,
                duration_ms=(time.perf_counter() - t0) * 1000,
            )
            forget_trace(trace_id)
            raise
        finally:
            if final_status != "error":
                emit("token_usage", total_usage.model_dump(), trace_id)
                emit(
                    "request_end",
                    {
                        "status": final_status,
                        "endpoint": "/generate",
                        "context_warning": context_warning,
                        "tool_calls_count": len(tool_calls_made),
                        "usage": total_usage.model_dump(),
                        "final_response": final_response[:16384],
                    },
                    trace_id,
                    duration_ms=(time.perf_counter() - t0) * 1000,
                )
                forget_trace(trace_id)
                if last_user_msg and final_response:
                    import asyncio as _asyncio
                    _asyncio.ensure_future(
                        log_turn(
                            trace_id=trace_id,
                            user_message=last_user_msg,
                            assistant_message=final_response,
                            system_prompt=system_prompt,
                        )
                    )

    return EventSourceResponse(event_generator())


@router.post("/compress", response_model=CompressResponse)
async def compress(request: CompressRequest):
    messages = [m.model_dump() for m in request.messages]
    compressed = await _compress_messages(messages)
    return CompressResponse(messages=[Message(**m) for m in compressed])


@router.get("/conversations")
async def list_conversations(limit: int = 100, offset: int = 0, since: str = None):
    return get_conversations(limit=limit, offset=offset, since=since)
