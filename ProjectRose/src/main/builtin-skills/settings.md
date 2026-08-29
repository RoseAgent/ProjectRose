---
description: What the user can configure in ProjectRose — explained in terms of what they do, not what the settings are called internally
---

This skill is what to load when the user asks "where do I change X?" or "how do I turn Y off?" — everything below is described from the user's point of view.

The Settings button is the cog in the app. Settings split into a few sections.

## General

- **Your name and the agent's name.** What you call the user, what the user calls you. Used in greetings and in your responses.
- **Microphone.** Pick which microphone to use for voice input.
- **Voice transcription.** Which on-device speech-to-text model to use (the default is fine for most people).
- **Active listening.** How long to wait after the user stops talking before sending the message. Adjustable in seconds.
- **Read responses aloud.** Built-in text-to-speech. The user picks a voice and a reading speed. Voice files download the first time they're used.
- **Chat panel starts expanded.** Whether the chat panel opens full-size or collapsed when the app launches.

## Providers (who runs the model)

Two choices:
- **OpenAI-compatible** — the user supplies a base URL, exact model id, and an optional encrypted API key.
- **Ollama** — runs locally on their machine. They paste the URL and choose from installed models.

When responses are slow or fail, verify the selected endpoint/model and use the provider card's connection test.

## Google

If the user wants you to read their Gmail, sync their Google Contacts, or sync their Google Calendar, they sign in here. Official builds work out of the box — they just click Sign In. Self-built copies can paste their own Google credentials.

One sign-in covers all three (email, contacts, calendar). Signing out disconnects all three.

## Contacts and Calendar sync

The Contacts and Calendar apps each have their own settings (the cog on their drawer cards):
- **Contacts sync** — which kinds of contacts (person, business, website, other) round-trip with Google Contacts. Pull and push are separate, confirmed actions.
- **Calendar sync** — which Google calendars round-trip. Same confirmed pull/push pattern.

Load `rose:contacts-calendar` if the user wants to understand what contacts and events are beyond the toggles.

## Email

The user's inbox. They pick a provider (Gmail or IMAP/SMTP), enter credentials, and choose which folders to surface. Passwords are stored encrypted on their machine, not in the regular settings file.

## Tools

Every tool you can use is listed here. The user can:
- Toggle any single tool off in the current project
- See which extension contributes each tool

If a tool the user expects you to have is missing, this is the first place to look.

## Extensions

A list of installed extensions plus a browse view for the in-app store. The user can:
- Enable or disable an extension in the current project
- Install a new one from the store
- Configure each extension's own settings

Some extensions have their own settings pages — those open inside the Extensions section.

## Where the settings file lives

If the user wants to back up or hand-edit, the settings file lives in their user folder under `.rose/settings.json`. Workspace-specific overrides live inside the project at `.projectrose/settings.json`. Most users never need to touch either — the UI covers everything.

## Workspace vs global

A handful of settings are workspace-specific rather than global:
- Which tools are turned off
- Which extensions are enabled
- Each extension's own per-project configuration

Everything else (mic, voice, providers, contacts, calendar, email) is global — the same in every project the user opens.

## Related skills

- `rose:contacts-calendar` — what the contacts and calendar sync toggles actually gate
- `rose:tools` — every tool listed on the Tools page, explained
- `rose:extensions` — what installed extensions can add
