# Email Template Feature — Design Spec

**Date:** 2026-05-03
**Status:** Approved

## Overview

Add a per-campaign editable email template with merge variables. Campaigns can run in either **AI mode** (existing Gemini-generated emails, unchanged) or **Template mode** (user-written template with `{{variable}}` substitution). The two modes are toggled per campaign. If the template includes `{{aiPersonalization}}`, Gemini generates a short personalised blurb for that slot; if the tag is absent, no AI is involved.

## Data Model

One migration adds three fields to the `Campaign` model:

```prisma
emailMode             EmailMode  @default(AI)
emailTemplateSubject  String?
emailTemplateBody     String?

enum EmailMode {
  AI
  TEMPLATE
}
```

- `emailMode` defaults to `AI` — all existing campaigns are unaffected.
- Both template fields are nullable. A campaign with no template set behaves exactly as today.
- No new tables or foreign keys.

## Backend

### `services/templateEngine.js`

Two exported functions:

**`substituteVariables(template, lead)`**
- Replaces `{{firstName}}`, `{{lastName}}`, `{{title}}`, `{{company}}` with the corresponding lead fields.
- If `{{aiPersonalization}}` is absent, returns the string unchanged. Pure function, no side effects.

**`renderTemplate(templateSubject, templateBody, lead, geminiService)`**
- Calls `substituteVariables` on both subject and body.
- Checks whether `{{aiPersonalization}}` appears in either result.
- If present: calls Gemini to generate a short personalised paragraph for the lead, substitutes it in.
- Returns `{ subject, body }`.

### `routes/campaigns.js` — two new endpoints

**`GET /api/campaigns/:id/template`**
- Returns `{ emailMode, emailTemplateSubject, emailTemplateBody }`.
- Requires auth; any role can read.

**`PUT /api/campaigns/:id/template`**
- Accepts `{ emailMode, subject, body }`.
- Zod validation: `emailMode` must be `AI` or `TEMPLATE`; if `TEMPLATE`, `subject` and `body` must be non-empty strings.
- Updates the campaign row, returns updated fields.
- Requires `ADMIN` or `MANAGER` role.

## Worker

`workers/generateEmail.js` — branch on mode after fetching the campaign:

```
if campaign.mode === TEST:
    draft = buildTestDraft(lead)
else if campaign.emailMode === TEMPLATE:
    draft = await renderTemplate(subject, body, lead, gemini)
else:
    draft = await generateDraft(lead, DEFAULT_PROFILE, { brandDoc })
```

- `TEST` campaigns always use `buildTestDraft` regardless of `emailMode` — the TEST check comes first.
- All other existing behaviour is unchanged.

## Frontend

### `components/EmailTemplatePanel.jsx`

Collapsible panel inserted between `<FilterPreview>` and the leads section on `campaigns/[id]/page.jsx`.

**Collapsed state:** header shows "Email Template" + mode badge (`AI` or `Template`). Click to expand.

**Expanded state — three tabs:**

- **Edit tab**: subject `<input>` and body `<textarea>`. Variable chips row — clicking a chip inserts the tag at the cursor position. Chips: `{{firstName}}`, `{{lastName}}`, `{{title}}`, `{{company}}`, `{{aiPersonalization}}`. Save button calls `PUT /api/campaigns/:id/template` with `emailMode: TEMPLATE`.
- **Preview tab**: fetches the campaign's first lead, runs client-side variable substitution, renders `{{aiPersonalization}}` as `[AI personalisation]` placeholder. Displays a read-only email preview.
- **AI Mode tab**: "Switch to AI generation" button — calls `PUT` with `emailMode: AI`, clears template fields from local state, updates mode badge.

Unsaved changes warning when switching tabs with dirty (unsaved) fields.

**Visibility:** shown at all campaign statuses. Hidden for `VIEWER` role.

### `campaigns/[id]/page.jsx`

`<EmailTemplatePanel campaignId={id} token={...} isViewer={isViewer} />` inserted between `<FilterPreview>` and the leads/status sections.

## Error Handling

- `PUT` with `emailMode: TEMPLATE` and empty subject or body → 400 from Zod validation.
- If Gemini fails during `{{aiPersonalization}}` substitution → worker throws, pg-boss retries as normal.
- If no leads exist yet when Preview tab is opened → show "No leads to preview yet."

## Testing

- Unit tests for `substituteVariables` and `renderTemplate` in `templateEngine.js` — cover all variables, missing variables, absent `{{aiPersonalization}}`, present `{{aiPersonalization}}`.
- Integration test for `PUT /api/campaigns/:id/template` — valid payload, missing fields when mode is TEMPLATE, role check (VIEWER gets 403).
- Worker test: mock `renderTemplate`; assert it is called when `emailMode === TEMPLATE` and not called when `AI`.
