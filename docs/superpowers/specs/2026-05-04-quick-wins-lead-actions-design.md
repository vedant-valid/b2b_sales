# Quick Wins: Lead Actions (F + E + B)

**Date:** 2026-05-04  
**Status:** Approved  
**Scope:** Frontend-only. No schema migrations, no new backend endpoints.

---

## 1. Problem

Three gaps in the current leads UX:

- **F** — No "Mark as contacted" button. The `PATCH /api/leads/:id` endpoint exists but there is no UI trigger.
- **E** — Lead status is shown as plain text. No color coding makes it hard to scan a list quickly.
- **B** — No way to separate irrelevant leads. Skipped leads clutter the active list with no way to review or undo.

---

## 2. Goals

1. Allow marking a lead as contacted or irrelevant with one click from the list — no need to open the detail page.
2. Make lead status scannable at a glance via color-coded badges.
3. Separate irrelevant (SKIPPED) leads into their own tab so the active list stays clean.

---

## 3. Non-Goals

- No backend changes — existing `PATCH /api/leads/:id` handles all status transitions.
- No bulk-select / bulk-apply (future sprint).
- No migration or new DB fields.

---

## 4. Data Layer

`LeadStatus` enum values and their UI meaning:

| DB value         | UI label       | Tab      |
|------------------|----------------|----------|
| NEW              | New            | Active   |
| CONTACTED        | Contacted      | Active   |
| REPLIED          | Replied        | Active   |
| INTERESTED       | Interested     | Active   |
| NOT_INTERESTED   | Not Interested | Active   |
| NEUTRAL          | Neutral        | Active   |
| CONVERTIBLE      | Convertible    | Active   |
| SKIPPED          | Irrelevant     | Irrelevant |

All transitions go through `PATCH /api/leads/:id` with `{ status: "<value>" }`.

---

## 5. Components

### 5.1 `LeadStatusBadge` (new, `src/components/LeadStatusBadge.jsx`)

Pill badge mapping status → color. Replaces all plain-text status displays.

| Status           | Tailwind classes                          |
|------------------|-------------------------------------------|
| NEW              | `bg-gray-100 text-gray-600`              |
| CONTACTED        | `bg-blue-100 text-blue-700`              |
| REPLIED          | `bg-purple-100 text-purple-700`          |
| INTERESTED       | `bg-green-100 text-green-700`            |
| NOT_INTERESTED   | `bg-red-100 text-red-600`               |
| NEUTRAL          | `bg-amber-100 text-amber-700`            |
| CONVERTIBLE      | `bg-teal-100 text-teal-700`             |
| SKIPPED          | `bg-orange-100 text-orange-600`         |

Props: `{ status: string }`. Renders `<span>` with label from table above.

### 5.2 `LeadRowActions` (new, `src/components/LeadRowActions.jsx`)

Compact inline action links rendered in the last column of any lead table row.

Logic:
- If `status === "NEW"` → show **"Contacted"** (blue) + **"Irrelevant"** (red)
- If `status === "CONTACTED"` → show **"Irrelevant"** (red) + **"Undo"** (gray, resets to NEW)
- If `status === "SKIPPED"` → show **"Restore"** (gray, resets to NEW)
- All other statuses → show **"Irrelevant"** (red) only

On click: optimistic UI update + `PATCH /api/leads/:id` call. On error: revert.

Props: `{ lead, token, onStatusChange(id, newStatus) }`.

---

## 6. Page Changes

### 6.1 `/leads` page (`src/app/(app)/leads/page.jsx`)

Add tab bar at top:
```
[ Active (n) ]  [ Irrelevant (n) ]
```

- **Active tab**: leads where `status !== "SKIPPED"`, ordered by `createdAt desc`.
- **Irrelevant tab**: leads where `status === "SKIPPED"`, same order.

Each row gets:
- `LeadStatusBadge` replacing the plain status text.
- `LeadRowActions` in a new rightmost column.

### 6.2 Campaign detail page (`src/app/(app)/campaigns/[id]/page.jsx`)

Tabs only apply when campaign status is `RUNNING`, `PAUSED`, or `COMPLETED`. The existing `LeadApprovalTable` (shown during `AWAITING_LEAD_SELECTION` and `AWAITING_LEAD_APPROVAL`) is unchanged. Once past approval, the lead table switches to the tabbed view with `LeadStatusBadge` + `LeadRowActions`.

### 6.3 Lead detail page (`src/app/(app)/leads/[id]/page.jsx`)

Replace `<p>Status: {lead.status}</p>` with:
- `LeadStatusBadge` showing current status.
- A small inline status selector (native `<select>`) listing all statuses. On change: call `PATCH /api/leads/:id`. On success: refresh lead.

---

## 7. Error Handling

- Optimistic update on row action; revert on API error and show a small inline error message next to the button.
- Detail page selector disables during PATCH request; re-enables on resolve.

---

## 8. Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/LeadStatusBadge.jsx` | New |
| `frontend/src/components/LeadRowActions.jsx` | New |
| `frontend/src/app/(app)/leads/page.jsx` | Add tabs, badge, row actions |
| `frontend/src/app/(app)/campaigns/[id]/page.jsx` | Add tabs, badge, row actions |
| `frontend/src/app/(app)/leads/[id]/page.jsx` | Replace status text with badge + selector |

No backend changes.

---

## 9. Success Criteria

- Clicking "Contacted" on a NEW lead row immediately shows it with a blue CONTACTED badge.
- Clicking "Irrelevant" moves the lead to the Irrelevant tab instantly (optimistic).
- Clicking "Restore" on the Irrelevant tab moves it back to Active.
- All statuses are color-coded consistently across the leads list, campaign detail, and lead detail pages.
- No page reload required for any status change.
