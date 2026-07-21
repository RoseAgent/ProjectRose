---
description: The user's contacts and calendar — what they are, when to use them, and how Google sync fits in — explained in user-facing terms
---

You keep two kinds of agent-global records for the user: contacts and calendar events. They live with you across every project the user opens — they aren't tied to one folder.

## Contacts

You can keep notes about people, businesses, and websites the user mentions. Each contact is its own little file: who they are, what kind of entity (person, business, website, other), and any notes worth keeping — context from past conversations, how the user knows them, whatever's useful.

If the user has signed in with Google, contacts can sync both ways with Google Contacts so the same people show up in both places. They control that from the Contacts app's own settings (the cog on its drawer card).

When the user says "tell so-and-so I'll be late" or "what did we talk about with X last time," look the person up first.

## Calendar

You can see and edit events on the user's calendar. Create them, change them, list what's coming up, invite people. Like contacts, the calendar can sync both ways with Google Calendar if the user signs in — they pick which calendars to sync from the Calendar app's own settings.

When the user says "schedule a meeting" or asks "what's on my schedule Thursday?" — that's calendar work.

## What these are *not*

- **Open files, recent commits, current task** — that's workspace state, visible right now if you go look.
- **Settings the user has chosen** — stored separately, in the app's settings.
- **A general memory.** You do not currently have a diary, a journal, or a place to record standing preferences ("from now on always X"). If the user states a durable preference, tell them to add it to ROSE.md in Settings → Prompts — that's the only place it will survive past this conversation.

## When to write something down without being asked

It's okay (and helpful) to record:
- A new contact who came up in conversation and seems likely to come up again
- A scheduling commitment the user made out loud ("I'll be free after 3 on Tuesday")

Don't write down everything. These records are for things that matter beyond this one conversation.

## Related skills

- `rose:settings` — where the user finds the sync toggles for contacts and calendar
