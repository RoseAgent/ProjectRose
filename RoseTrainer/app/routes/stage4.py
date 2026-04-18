from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from app.database import get_db
from app.training.pile import pile_available

router = APIRouter()
templates: Jinja2Templates | None = None
PAGE_SIZE = 25


def set_templates(t: Jinja2Templates):
    global templates
    templates = t


@router.get("/models/{model_id}/stage/4")
async def stage4_page(request: Request, model_id: int, page: int = 1, db=Depends(get_db)):
    model = await db.fetchrow("SELECT * FROM trainer_models WHERE id = $1", model_id)
    offset = (page - 1) * PAGE_SIZE
    total = await db.fetchval(
        "SELECT COUNT(*) FROM training_data WHERE model_id = $1 AND deleted = FALSE", model_id
    )
    rows = await db.fetch(
        """
        SELECT * FROM training_data
        WHERE model_id = $1 AND deleted = FALSE
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
        """,
        model_id, PAGE_SIZE, offset,
    )
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    return templates.TemplateResponse(request, "stage4.html", {
        "model": dict(model),
        "rows": [dict(r) for r in rows],
        "page": page,
        "total_pages": total_pages,
        "total": total,
        "pile_available": pile_available(),
    })


@router.get("/models/{model_id}/stage/4/{entry_id}/edit")
async def edit_form(request: Request, model_id: int, entry_id: int, db=Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM training_data WHERE id = $1 AND model_id = $2", entry_id, model_id)
    return templates.TemplateResponse(request, "stage4_edit_row.html", {"row": dict(row)})


@router.put("/models/{model_id}/stage/4/{entry_id}")
async def update_entry(
    request: Request,
    model_id: int,
    entry_id: int,
    input: str = Form(...),
    thinking: str = Form(default=""),
    output: str = Form(...),
    db=Depends(get_db),
):
    await db.execute(
        """
        UPDATE training_data
        SET input = $1, thinking = $2, output = $3, reviewed = TRUE, updated_at = now()
        WHERE id = $4 AND model_id = $5
        """,
        input, thinking, output, entry_id, model_id,
    )
    row = await db.fetchrow("SELECT * FROM training_data WHERE id = $1", entry_id)
    return templates.TemplateResponse(request, "stage4_row.html", {"row": dict(row)})


@router.delete("/models/{model_id}/stage/4/{entry_id}")
async def delete_entry(model_id: int, entry_id: int, db=Depends(get_db)):
    await db.execute(
        "UPDATE training_data SET deleted = TRUE, updated_at = now() WHERE id = $1 AND model_id = $2",
        entry_id, model_id,
    )
    return HTMLResponse("")


@router.post("/models/{model_id}/stage/4/pile-toggle")
async def pile_toggle(model_id: int, db=Depends(get_db)):
    model = await db.fetchrow("SELECT use_pile FROM trainer_models WHERE id = $1", model_id)
    await db.execute(
        "UPDATE trainer_models SET use_pile = $1, updated_at = now() WHERE id = $2",
        not model["use_pile"], model_id,
    )
    return RedirectResponse(f"/trainer/models/{model_id}/stage/4", status_code=303)


@router.post("/models/{model_id}/stage/4/complete")
async def complete_review(model_id: int, db=Depends(get_db)):
    await db.execute(
        "UPDATE growth_stages SET status = 'complete', completed_at = now() WHERE model_id = $1 AND stage = 4",
        model_id,
    )
    return RedirectResponse(f"/trainer/models/{model_id}/stage/5", status_code=303)
