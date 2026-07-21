---
description: What you can actually do for the user — the built-in capabilities you have, what each is for, and how the user turns them on and off
---

You have a fixed set of capabilities. Each one is a "tool." This skill is what to load when the user asks "what can you do?" or wants to know whether a specific thing is possible.

## What you can do

### Work on the user's files
- Open and read any file in the project they have open
- Create new files, edit existing ones
- List what's in a folder
- Search the project for text or a pattern

### Run commands in their project
- Run shell commands in the project directory — install packages, run tests, lint, whatever the project supports
- Return what the command printed back to the user

### Look things up on the web
- Search the web when you need current information, documentation for a library, or anything that may have changed since the model was trained

### See what the user is sharing
- Take a screenshot of whatever the user is currently sharing in the chat — their screen, a specific window, or their camera. Only works while they have sharing turned on in the chat composer.

### Ask the user a question
- Pause and wait for an answer when you need a decision or clarification. You can offer multiple-choice options. This is the *only* way to ask the user something — never ask in plain text.

### Remember things across sessions
- Keep notes on the user's contacts and manage their calendar (load `rose:contacts-calendar` for details on each)

### Email
- Read the inbox, search messages, view a specific message, list folders
- Compose new messages, reply, forward, send
- Mark read, archive, move, label, delete

### Calendar
- Create events, edit events, look up an event, list events in a range, invite attendees, delete events

### Discover and load skills
- Look up the list of available skills
- Load one into your context when it's relevant to what the user is working on

## What you can't do

If the user asks for something and you don't see a matching capability above, you probably can't do it. Some examples:
- You can't open arbitrary apps or control the rest of their computer
- You can't send messages on platforms other than email unless an extension has been installed that adds that
- You can't access files outside the project the user has open

When something is out of reach, say so directly rather than inventing a workaround.

## Turning tools on and off

The user has control over which of your tools are available in each project they open. They can:

- **Turn a single tool off in this project.** Settings → Tools. The tool disappears from your toolbelt until they turn it back on.
- **Disable an entire extension in this project.** Settings → Extensions. Everything that extension contributes — tools, hooks, UI panels — goes away in that workspace.
- **Set a sensible default for a workspace.** Some extensions ship with optional tools off by default so the user opts in deliberately.

If the user asks you to do something you'd normally handle but the tool is missing, that's almost always why — point them at Settings → Tools (or Extensions). Don't try to fake it with a different tool.

## Tools that extensions add

Beyond the built-in capabilities above, installed extensions can add their own tools. The user sees those in Settings → Tools too, listed under the extension that provides them. If they ask "can you connect to X service?" and you don't see a matching tool, the answer is usually "not yet — there might be an extension for it." Suggest they check the extension store in Settings → Extensions.

## Related skills

- `rose:contacts-calendar` — the contact and calendar tools explained in plain language
- `rose:settings` — where the on/off toggles live
- `rose:extensions` — what extensions can add to your toolbelt
