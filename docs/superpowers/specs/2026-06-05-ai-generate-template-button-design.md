# AI Generate Template Button

**Date:** 2026-06-05
**Status:** Approved

## Problem

The Email Template panel supports manual authoring (Edit tab) and full AI generation per lead (AI Mode). There is no way to get an AI-drafted starting point in the Edit tab — users have to write from scratch. A "Generate with AI" button would let Gemini produce a ready-to-edit template pre-filled with the correct `{{variable}}` placeholders, using the campaign's own goal as context.

## Scope

- New backend endpoint: `POST /api/campaigns/:id/template/generate`
- New Gemini prompt function: `generateTemplateEmail(rawGoal, brandDoc)` in `emailGen.js`
- UI change: "Generate with AI" button in the Edit tab of `EmailTemplatePanel.jsx`
- No DB schema changes

## Backend

### New endpoint

`POST /api/campaigns/:id/template/generate`

- Auth: `requireAuth` + `requireRole("ADMIN", "MANAGER")`
- Fetches the campaign by `id`; returns 404 if not found
- Fetches `brandDoc` singleton (may be null)
- Calls `generateTemplateEmail(campaign.rawGoal, brandDoc?.content ?? null)`
- Returns `{ subject, body }` — no DB write; this is a generation-only call
- Saving is handled by the existing `PUT /api/campaigns/:id/template` endpoint

### New function in `emailGen.js`

```
generateTemplateEmail(rawGoal, brandDoc?)
```

Gemini system prompt instructs the model to:
- Write a short cold outreach B2B email (subject < 60 chars, body < 150 words, plain text, no markdown, no em-dashes)
- Use `{{firstName}}`, `{{lastName}}`, `{{title}}`, `{{company}}` as placeholders wherever a lead-specific value belongs
- Optionally include `{{aiPersonalization}}` for a context-aware hook line
- Ground the email's value proposition in the `rawGoal` content
- Apply `brandDoc` guidelines if provided (same pattern as `generateDraft`)
- Return `{ "subject": string, "body": string }`

These tokens are the same set already defined in `VARIABLES` on the frontend and handled by `templateEngine.js`.

## Frontend

### `EmailTemplatePanel.jsx` — Edit tab

Add a `Generate with AI` button at the top-right of the Edit tab, inline with the Variables row label.

**State additions:**
- `generating` (boolean) — true while the API call is in flight

**Behaviour:**
1. If `subject` or `body` is non-empty, show `confirm("Replace existing template with AI-generated content?")` before proceeding. If the user cancels, do nothing.
2. Set `generating = true`, call `POST /api/campaigns/:id/template/generate`.
3. On success: populate `subject` and `body` state. The form becomes dirty (existing dirty-check logic handles this). User must still click "Save Template" explicitly.
4. On error: surface the error in the existing `saveError` banner.
5. Set `generating = false`.

**Button label:** "Generate with AI" → "Generating…" while in flight. Disabled while `generating` or `saving`.

**No new state for errors** — reuses the existing `saveError` / `setSaveError` already present.

## Error handling

| Scenario | Behaviour |
|---|---|
| Campaign not found | 404 → `saveError` banner |
| Gemini unavailable / key missing | 502 from backend → `saveError` banner |
| User cancels confirm dialog | No-op, fields unchanged |
| Generate called while save in flight | Button disabled (`saving` state) |

## Out of scope

- Streaming the generated output token by token
- Letting the user provide a custom prompt or instructions
- Auto-saving after generation
