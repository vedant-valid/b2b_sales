# UI/UX Overhaul — Design Spec

**Date:** 2026-05-04
**Status:** Approved
**Primary user:** Non-technical sales/marketing person
**Aesthetic:** Clean minimal, meaningful color, clear visual hierarchy

---

## 1. Problem

The app reads like a developer dashboard. Raw enum names (`AWAITING_LEAD_SELECTION`), bare number stats, no active-nav indicators, no empty-state guidance, a JSON textarea for filter editing, and no sense of where you are in a workflow make the app inaccessible to a non-technical user.

---

## 2. Goals

1. Every label a non-technical user sees is plain English — no underscores, no enum names.
2. Every page tells the user what to do next.
3. The campaign flow feels like a guided process, not a database view.
4. Empty states explain themselves and point forward.

---

## 3. Scope

Frontend-only. No schema changes, no new backend endpoints. All changes are in `frontend/src/`.

---

## 4. Section 1 — Global Fixes

### 4.1 Status Label Translation

A single `CAMPAIGN_STATUS_LABELS` map used everywhere status is displayed:

| Enum value | Human label | Action needed? |
|-----------|-------------|----------------|
| DRAFT | Draft | No |
| RUNNING | Running… | No |
| AWAITING_LEAD_SELECTION | Review Leads | Yes |
| AWAITING_LEAD_APPROVAL | Approve Leads | Yes |
| AWAITING_EMAIL_APPROVAL | Approve Emails | Yes |
| READY_FOR_OUTREACH | Sending… | No |
| PAUSED | Paused | No |
| COMPLETED | Completed | No |

Action-needed statuses show an amber dot (●) next to the badge.

Create `frontend/src/lib/campaignStatus.js` exporting:
- `CAMPAIGN_STATUS_LABELS` — the map above
- `CAMPAIGN_STATUS_NEEDS_ACTION` — Set of action-needed statuses
- `campaignStatusLabel(status)` — returns human label
- `campaignStatusNeedsAction(status)` — returns boolean

Replace all raw status displays across: `campaigns/page.jsx`, `campaigns/[id]/page.jsx`, `StatusBadge` component.

### 4.2 Active Nav Indicator

`layout.jsx` uses static Link elements with no active state. Convert nav to a client component that reads `usePathname()`. Active item gets:
- Left border: `border-l-2 border-black`
- Background: `bg-white`
- Text: `font-semibold text-black`

Add icons before each label (Unicode or simple SVG — no icon library install):
- Dashboard: 📊  Campaigns: 📣  Leads: 👥  Replies: 💬  Export: ↓  Settings: ⚙

### 4.3 Credits in Header

Header currently shows `email · ROLE`. Change to `email · ROLE · Credits: N`.

Credits come from `GET /api/auth/me` (added as part of this feature — returns the authenticated user's full profile including credits). Fetch on mount in the layout, display in header. If unavailable, omit the credits portion silently.

---

## 5. Section 2 — Dashboard

Replace the current 3-number grid + button with:

### 5.1 Attention Strip

Query campaigns and filter to those where `CAMPAIGN_STATUS_NEEDS_ACTION` is true.

- If any: render a row of compact cards, one per campaign. Each card: campaign name (link), plain-English action label ("Review Leads"), amber dot indicator.
- If none: show a green "You're all caught up ✓" banner.

### 5.2 Pipeline Stats Row

Four stat cards in a 2×2 or 4-column grid:

| Stat | Source |
|------|--------|
| Active Leads | leads where status ∉ {SKIPPED} |
| Contacted | leads where status = CONTACTED |
| Replies | total replies count |
| Interested | leads where status ∈ {INTERESTED, CONVERTIBLE} |

### 5.3 Recent Campaigns

Last 5 campaigns as a compact list: name (link) + status badge + lead count + date. Replaces nothing — rendered below the stats row.

### 5.4 Header CTA

"+ New Campaign" button in top-right of the page header (inside the page, not the app header).

---

## 6. Section 3 — Campaign Detail Page

### 6.1 Step Progress Bar

Map campaign status to a step number (1–5):

| Status | Step |
|--------|------|
| DRAFT | 1 — Setup |
| RUNNING | 2 — Finding Leads |
| AWAITING_LEAD_SELECTION | 3 — Review Leads |
| AWAITING_LEAD_APPROVAL / READY_FOR_OUTREACH | 4 — Send Emails |
| AWAITING_EMAIL_APPROVAL | 4 — Send Emails |
| COMPLETED | 5 — Done |
| PAUSED | current step frozen |

Steps: `Setup → Find Leads → Review Leads → Send Emails → Done`

Render as a horizontal stepper: completed steps show a ✓ in a filled circle, active step shows step number in a black circle, future steps show number in a gray circle with gray text.

### 6.2 Action Card

Replace the current status-gated colored boxes with a single `<ActionCard>` component that renders based on campaign status:

**AWAITING_LEAD_SELECTION:**
- Headline: `{n} leads found — review and select the ones you want to contact`
- Sub-text: `Unlocking costs 1 credit per lead. Credits are only charged after you confirm.`
- Buttons: `Unlock {n} leads ({n} credits)` + `Discard all & start over`

**AWAITING_LEAD_APPROVAL:**
- Headline: `{n} leads ready — skip any you don't want, then approve the rest`
- Buttons: `Approve {n} leads` + `Reject all`

**AWAITING_EMAIL_APPROVAL:**
- Headline: `Emails drafted — review them below then launch the campaign`
- Buttons: `Approve & launch` + `Reject — start over`

**RUNNING:**
- Headline: `Campaign is running — emails are being sent`
- Sub-text: `Replies will appear automatically in the Replies tab.`

**COMPLETED:**
- Headline: `Campaign complete`
- Sub-text: `{n} leads contacted. Check the Replies page for responses.`

### 6.3 Structured Filter Editor

Replace the raw JSON textarea in the filter re-run section with a set of labeled text inputs, one per filter category:

| Label | Field | Input hint |
|-------|-------|------------|
| Locations | `locations` | e.g. India, United States |
| Company sizes | `companySizes` | e.g. 11-50, 51-200 |
| Seniority | `seniorities` | e.g. c-suite, director |
| Departments | `departments` | e.g. Engineering & Technical |
| Job title keywords | `titleKeywords` | e.g. cto, head of engineering |
| Exclude job titles | `excludeTitleKeywords` | e.g. ciso, security |
| Exclude industries | `excludeIndustries` | e.g. Hospitality, Healthcare |

Each field parses its comma-separated value into an array on submit. Empty fields are omitted from the submitted filter object.

### 6.4 Job Progress Text

Replace `"fetch-leads: completed"` / raw job state strings with human messages:
- Running: `"Finding leads… this usually takes 20–30 seconds"`
- Completed: `"Done — leads loaded below"`
- Failed: `"Something went wrong. Try running the campaign again."`

---

## 7. Section 4 — Leads, Replies, Empty States

### 7.1 Leads Page

- Add helper text below the heading: `"These are the people your campaigns are reaching out to."`
- Lead rows: replace blank email column for un-enriched leads with a gray `Not unlocked` pill instead of `—`
- Company initial avatar: colored circle (bg determined by first char of company name) with the first letter, rendered as the first column

### 7.2 Replies Page

- Group reply cards by sentiment in this order: INTERESTED → CONVERTIBLE → NEUTRAL → NOT_INTERESTED
- Each group has a heading with count: `"Interested (3)"`
- Empty state: `"No replies yet — they'll appear here automatically when leads respond to your emails"`

### 7.3 Empty States

| Page/Section | Empty message | CTA |
|-------------|---------------|-----|
| Campaigns list | "You haven't created any campaigns yet." | "+ New campaign" link |
| Leads page | "No leads yet. Run a campaign to start finding people." | "Go to Campaigns" link |
| Replies page | "No replies yet — they appear here automatically." | — |
| Campaign leads (post-approval) | "No leads yet." | — |
| Irrelevant tab | "No leads marked as irrelevant." | — |

### 7.4 Campaign Wizard Helper Text

Add one plain-English sentence above each wizard step:
- Step 1 (Goal): `"Describe in plain English who you want to reach and why."`
- Step 2 (Preview filters): `"We extracted these filters from your goal — review them before fetching leads."`
- Step 3 (Confirm): `"Everything looks good? Hit Create to set up the campaign."`

---

## 8. Files Changed

| File | Change |
|------|--------|
| `src/lib/campaignStatus.js` | New — status label + action helpers |
| `src/app/(app)/layout.jsx` → `Sidebar.jsx` | Convert to client component, active nav, icons |
| `src/app/(app)/dashboard/page.jsx` | Attention strip, pipeline stats, recent campaigns |
| `src/app/(app)/campaigns/page.jsx` | Use human status labels, empty state |
| `src/app/(app)/campaigns/[id]/page.jsx` | Step bar, ActionCard, structured filter editor, job text |
| `src/app/(app)/leads/page.jsx` | Helper text, avatar column, empty states, not-unlocked pill |
| `src/app/(app)/replies/page.jsx` | Grouped by sentiment, empty state |
| `src/components/CampaignWizard.jsx` | Helper text per step |
| `src/components/JobProgressBar.jsx` | Human-readable state messages |

---

## 9. Success Criteria

- A non-technical user can open the app, understand where they are, and know what to do next — on every page — without reading any documentation.
- No raw enum values (underscores, ALL_CAPS) visible anywhere in the UI.
- Every empty state tells the user what to do next.
- The campaign flow feels like 5 clear steps, not a status field changing value.
