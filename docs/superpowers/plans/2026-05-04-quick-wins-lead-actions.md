# Quick Wins: Lead Actions (F + E + B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add color-coded lead status badges, inline "Contacted" / "Irrelevant" row actions, and Active / Irrelevant tab split across the leads page, campaign detail page, and lead detail page.

**Architecture:** Two new presentational components (`LeadStatusBadge`, `LeadRowActions`) are wired into the existing `LeadTable` and three pages. All status transitions use the existing `PATCH /api/leads/:id` endpoint — zero backend changes. `SKIPPED` is the Irrelevant status in DB; only the UI label changes.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind 4, Vitest + @testing-library/react, existing `apiFetch` from `src/lib/api.js`.

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/components/LeadStatusBadge.jsx` | **Create** — pill badge for any LeadStatus value |
| `frontend/src/components/LeadRowActions.jsx` | **Create** — inline action buttons with optimistic updates |
| `frontend/src/components/__tests__/LeadStatusBadge.test.jsx` | **Create** — badge unit tests |
| `frontend/src/components/__tests__/LeadRowActions.test.jsx` | **Create** — row actions unit tests |
| `frontend/src/components/LeadTable.jsx` | **Modify** — add badge + optional actions column |
| `frontend/src/app/(app)/leads/page.jsx` | **Modify** — add Active/Irrelevant tabs |
| `frontend/src/app/(app)/campaigns/[id]/page.jsx` | **Modify** — replace inline table with tabbed LeadTable after approval |
| `frontend/src/app/(app)/leads/[id]/page.jsx` | **Modify** — replace plain status text with badge + selector |

---

## Task 1: `LeadStatusBadge` component

**Files:**
- Create: `frontend/src/components/LeadStatusBadge.jsx`
- Create: `frontend/src/components/__tests__/LeadStatusBadge.test.jsx`

- [ ] **Step 1.1: Write the failing tests**

Create `frontend/src/components/__tests__/LeadStatusBadge.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import LeadStatusBadge from "../LeadStatusBadge";

test("renders 'New' for NEW status", () => {
  render(<LeadStatusBadge status="NEW" />);
  expect(screen.getByText("New")).toBeInTheDocument();
});

test("renders 'Irrelevant' (not 'Skipped') for SKIPPED status", () => {
  render(<LeadStatusBadge status="SKIPPED" />);
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
  expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
});

test("renders 'Contacted' for CONTACTED status", () => {
  render(<LeadStatusBadge status="CONTACTED" />);
  expect(screen.getByText("Contacted")).toBeInTheDocument();
});

test("applies green class for INTERESTED", () => {
  const { container } = render(<LeadStatusBadge status="INTERESTED" />);
  expect(container.firstChild.className).toContain("bg-green-100");
});

test("applies orange class for SKIPPED", () => {
  const { container } = render(<LeadStatusBadge status="SKIPPED" />);
  expect(container.firstChild.className).toContain("bg-orange-100");
});

test("falls back gracefully for unknown status", () => {
  render(<LeadStatusBadge status="UNKNOWN_FUTURE_STATUS" />);
  expect(screen.getByText("UNKNOWN_FUTURE_STATUS")).toBeInTheDocument();
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

Run from `frontend/`:
```bash
npx vitest run src/components/__tests__/LeadStatusBadge.test.jsx
```
Expected: all 6 tests fail with "Cannot find module '../LeadStatusBadge'".

- [ ] **Step 1.3: Create `LeadStatusBadge.jsx`**

Create `frontend/src/components/LeadStatusBadge.jsx`:

```jsx
const STATUS_CONFIG = {
  NEW:            { label: "New",            cls: "bg-gray-100 text-gray-600" },
  CONTACTED:      { label: "Contacted",      cls: "bg-blue-100 text-blue-700" },
  REPLIED:        { label: "Replied",        cls: "bg-purple-100 text-purple-700" },
  INTERESTED:     { label: "Interested",     cls: "bg-green-100 text-green-700" },
  NOT_INTERESTED: { label: "Not Interested", cls: "bg-red-100 text-red-600" },
  NEUTRAL:        { label: "Neutral",        cls: "bg-amber-100 text-amber-700" },
  CONVERTIBLE:    { label: "Convertible",    cls: "bg-teal-100 text-teal-700" },
  SKIPPED:        { label: "Irrelevant",     cls: "bg-orange-100 text-orange-600" },
};

export default function LeadStatusBadge({ status }) {
  const { label, cls } = STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npx vitest run src/components/__tests__/LeadStatusBadge.test.jsx
```
Expected: all 6 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/components/LeadStatusBadge.jsx frontend/src/components/__tests__/LeadStatusBadge.test.jsx
git commit -m "feat(ui): add LeadStatusBadge component with color-coded statuses"
```

---

## Task 2: `LeadRowActions` component

**Files:**
- Create: `frontend/src/components/LeadRowActions.jsx`
- Create: `frontend/src/components/__tests__/LeadRowActions.test.jsx`

- [ ] **Step 2.1: Write the failing tests**

Create `frontend/src/components/__tests__/LeadRowActions.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import LeadRowActions from "../LeadRowActions";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";

const mkLead = (status) => ({ id: "lead-1", status });

afterEach(() => { vi.clearAllMocks(); });

test("shows Contacted and Irrelevant for NEW", () => {
  render(<LeadRowActions lead={mkLead("NEW")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Contacted")).toBeInTheDocument();
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
});

test("shows Irrelevant and Undo for CONTACTED", () => {
  render(<LeadRowActions lead={mkLead("CONTACTED")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
  expect(screen.getByText("Undo")).toBeInTheDocument();
  expect(screen.queryByText("Contacted")).not.toBeInTheDocument();
});

test("shows only Restore for SKIPPED", () => {
  render(<LeadRowActions lead={mkLead("SKIPPED")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Restore")).toBeInTheDocument();
  expect(screen.queryByText("Irrelevant")).not.toBeInTheDocument();
  expect(screen.queryByText("Contacted")).not.toBeInTheDocument();
});

test("shows only Irrelevant for INTERESTED", () => {
  render(<LeadRowActions lead={mkLead("INTERESTED")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
  expect(screen.queryByText("Contacted")).not.toBeInTheDocument();
  expect(screen.queryByText("Restore")).not.toBeInTheDocument();
});

test("clicking Contacted calls onStatusChange optimistically then calls PATCH", async () => {
  apiFetch.mockResolvedValueOnce({ lead: {} });
  const onStatusChange = vi.fn();
  render(<LeadRowActions lead={mkLead("NEW")} token="tok" onStatusChange={onStatusChange} />);
  fireEvent.click(screen.getByText("Contacted"));
  expect(onStatusChange).toHaveBeenCalledWith("lead-1", "CONTACTED");
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith("/api/leads/lead-1", {
      token: "tok",
      method: "PATCH",
      body: { status: "CONTACTED" },
    })
  );
});

test("reverts status and shows error on API failure", async () => {
  apiFetch.mockRejectedValueOnce(new Error("network error"));
  const onStatusChange = vi.fn();
  render(<LeadRowActions lead={mkLead("NEW")} token="tok" onStatusChange={onStatusChange} />);
  fireEvent.click(screen.getByText("Irrelevant"));
  expect(onStatusChange).toHaveBeenNthCalledWith(1, "lead-1", "SKIPPED");
  await waitFor(() => {
    expect(onStatusChange).toHaveBeenNthCalledWith(2, "lead-1", "NEW");
  });
  expect(screen.getByText("Failed")).toBeInTheDocument();
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
npx vitest run src/components/__tests__/LeadRowActions.test.jsx
```
Expected: all 6 tests fail with "Cannot find module '../LeadRowActions'".

- [ ] **Step 2.3: Create `LeadRowActions.jsx`**

Create `frontend/src/components/LeadRowActions.jsx`:

```jsx
"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function LeadRowActions({ lead, token, onStatusChange }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function transition(newStatus) {
    setBusy(true);
    setError("");
    const prev = lead.status;
    onStatusChange(lead.id, newStatus);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        token,
        method: "PATCH",
        body: { status: newStatus },
      });
    } catch {
      onStatusChange(lead.id, prev);
      setError("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2 text-xs whitespace-nowrap">
      {lead.status === "NEW" && (
        <button
          disabled={busy}
          onClick={() => transition("CONTACTED")}
          className="text-blue-600 hover:underline disabled:opacity-50"
        >
          Contacted
        </button>
      )}
      {lead.status === "CONTACTED" && (
        <button
          disabled={busy}
          onClick={() => transition("NEW")}
          className="text-gray-500 hover:underline disabled:opacity-50"
        >
          Undo
        </button>
      )}
      {lead.status !== "SKIPPED" && (
        <button
          disabled={busy}
          onClick={() => transition("SKIPPED")}
          className="text-red-500 hover:underline disabled:opacity-50"
        >
          Irrelevant
        </button>
      )}
      {lead.status === "SKIPPED" && (
        <button
          disabled={busy}
          onClick={() => transition("NEW")}
          className="text-gray-500 hover:underline disabled:opacity-50"
        >
          Restore
        </button>
      )}
      {error && <span className="text-red-400">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
npx vitest run src/components/__tests__/LeadRowActions.test.jsx
```
Expected: all 6 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/components/LeadRowActions.jsx frontend/src/components/__tests__/LeadRowActions.test.jsx
git commit -m "feat(ui): add LeadRowActions with optimistic status transitions"
```

---

## Task 3: Upgrade `LeadTable`

**Files:**
- Modify: `frontend/src/components/LeadTable.jsx`

Current file is 22 lines. Full replacement:

- [ ] **Step 3.1: Replace `LeadTable.jsx`**

Overwrite `frontend/src/components/LeadTable.jsx` with:

```jsx
import Link from "next/link";
import LeadStatusBadge from "./LeadStatusBadge";
import LeadRowActions from "./LeadRowActions";

export default function LeadTable({ leads, token, onStatusChange }) {
  const withActions = token && onStatusChange;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b text-gray-500 text-xs uppercase tracking-wide">
          <th className="pb-1 pr-3">Name</th>
          <th className="pr-3">Title</th>
          <th className="pr-3">Company</th>
          <th className="pr-3">Email</th>
          <th className="pr-3">Status</th>
          {withActions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {leads.map((l) => (
          <tr key={l.id} className="border-b hover:bg-gray-50">
            <td className="py-2 pr-3">
              <Link className="underline" href={`/leads/${l.id}`}>
                {l.firstName} {l.lastName}
              </Link>
            </td>
            <td className="pr-3">{l.title ?? "—"}</td>
            <td className="pr-3">{l.company ?? "—"}</td>
            <td className="pr-3">{l.email ?? "—"}</td>
            <td className="pr-3">
              <LeadStatusBadge status={l.status} />
            </td>
            {withActions && (
              <td>
                <LeadRowActions lead={l} token={token} onStatusChange={onStatusChange} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3.2: Run all frontend tests**

```bash
npm test
```
Expected: all tests pass (LeadTable has no dedicated test file; the component-level tests for Badge and Actions already cover the pieces).

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/components/LeadTable.jsx
git commit -m "feat(ui): upgrade LeadTable with status badges and inline row actions"
```

---

## Task 4: Upgrade `/leads` page — Active / Irrelevant tabs

**Files:**
- Modify: `frontend/src/app/(app)/leads/page.jsx`

- [ ] **Step 4.1: Replace `leads/page.jsx`**

Overwrite `frontend/src/app/(app)/leads/page.jsx` with:

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import LeadTable from "@/components/LeadTable";

export default function LeadsPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState([]);
  const [tab, setTab] = useState("active");

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/leads", { token: session.backendToken })
      .then(({ leads }) => setLeads(leads))
      .catch((err) => { if (err.status === 401) signOut({ callbackUrl: "/login" }); });
  }, [session?.backendToken]);

  function onStatusChange(id, newStatus) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
  }

  const outreachLeads = leads.filter((l) => l.campaign?.mode !== "TEST");
  const testLeads     = leads.filter((l) => l.campaign?.mode === "TEST");

  const activeOutreach    = outreachLeads.filter((l) => l.status !== "SKIPPED");
  const irrelevantOutreach = outreachLeads.filter((l) => l.status === "SKIPPED");
  const activeTest        = testLeads.filter((l) => l.status !== "SKIPPED");
  const irrelevantTest    = testLeads.filter((l) => l.status === "SKIPPED");

  const totalActive    = activeOutreach.length + activeTest.length;
  const totalIrrelevant = irrelevantOutreach.length + irrelevantTest.length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Leads</h1>

      {/* Tab bar */}
      <div className="flex gap-0 border-b">
        <TabButton label="Active" count={totalActive} active={tab === "active"} onClick={() => setTab("active")} countCls="bg-gray-100 text-gray-600" />
        <TabButton label="Irrelevant" count={totalIrrelevant} active={tab === "irrelevant"} onClick={() => setTab("irrelevant")} countCls="bg-orange-100 text-orange-600" />
      </div>

      {tab === "active" && (
        <div className="space-y-8">
          <Section title="Outreach" count={activeOutreach.length} countCls="bg-gray-100 text-gray-600" empty="No outreach leads yet.">
            {activeOutreach.length > 0 && (
              <LeadTable leads={activeOutreach} token={session?.backendToken} onStatusChange={onStatusChange} />
            )}
          </Section>
          <Section title="Demo / Testing" count={activeTest.length} countCls="bg-amber-100 text-amber-700" empty="No test leads yet.">
            {activeTest.length > 0 && (
              <LeadTable leads={activeTest} token={session?.backendToken} onStatusChange={onStatusChange} />
            )}
          </Section>
        </div>
      )}

      {tab === "irrelevant" && (
        <div>
          {totalIrrelevant === 0 ? (
            <p className="text-sm text-gray-400">No leads marked as irrelevant yet.</p>
          ) : (
            <LeadTable leads={[...irrelevantOutreach, ...irrelevantTest]} token={session?.backendToken} onStatusChange={onStatusChange} />
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ label, count, active, onClick, countCls }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-black text-black" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}{" "}
      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${countCls}`}>{count}</span>
    </button>
  );
}

function Section({ title, count, countCls, empty, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${countCls}`}>{count}</span>
      </div>
      {count === 0 ? <p className="text-sm text-gray-400">{empty}</p> : children}
    </section>
  );
}
```

- [ ] **Step 4.2: Run all frontend tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/src/app/(app)/leads/page.jsx
git commit -m "feat(ui): add Active/Irrelevant tabs to leads page"
```

---

## Task 5: Upgrade campaign detail page — tabbed lead table

**Files:**
- Modify: `frontend/src/app/(app)/campaigns/[id]/page.jsx`

The section starting at line 290 (`{!["AWAITING_LEAD_APPROVAL", "AWAITING_LEAD_SELECTION"].includes...}`) renders an inline table. Replace it with the LeadTable component + tabs + onStatusChange.

- [ ] **Step 5.1: Add imports and state to campaign detail page**

At the top of `frontend/src/app/(app)/campaigns/[id]/page.jsx`, add to the existing imports:

```jsx
import LeadTable from "@/components/LeadTable";
```

After the existing `const [testLeadError, setTestLeadError] = useState("");` line, add:

```jsx
const [leadTab, setLeadTab] = useState("active");
```

After the existing `onUndoSkip` function, add:

```jsx
function onLeadStatusChange(id, newStatus) {
  setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
}
```

- [ ] **Step 5.2: Replace the inline lead table section**

Find and replace the block starting with:
```jsx
{!["AWAITING_LEAD_APPROVAL", "AWAITING_LEAD_SELECTION"].includes(campaign.status) && <div>
```
and ending with the closing `</div>}` of that block (lines 290–367 in the original file). Replace the entire block with:

```jsx
{!["AWAITING_LEAD_APPROVAL", "AWAITING_LEAD_SELECTION"].includes(campaign.status) && (
  <div className="space-y-3">
    <div className="flex justify-between items-center">
      <h2 className="font-semibold">Leads</h2>
      <div className="flex gap-2 items-center">
        {campaign.status === "RUNNING" && !isViewer && (
          <button
            onClick={onSyncStatus}
            disabled={acting}
            className="text-xs border border-gray-400 text-gray-700 bg-white px-2 py-1 rounded disabled:opacity-50"
          >
            Sync Status
          </button>
        )}
        {DEV_MODE && !isViewer && (
          <button
            onClick={onSeedDevLead}
            disabled={acting}
            className="text-xs border border-yellow-500 text-yellow-700 bg-yellow-50 px-2 py-1 rounded disabled:opacity-50"
          >
            + Add test lead (dev)
          </button>
        )}
      </div>
    </div>

    {leads.length === 0 ? (
      <p className="text-sm text-gray-500">No leads yet.</p>
    ) : (
      <>
        {/* Tab bar */}
        <div className="flex gap-0 border-b">
          {["active", "irrelevant"].map((t) => {
            const count = t === "active"
              ? leads.filter((l) => l.status !== "SKIPPED").length
              : leads.filter((l) => l.status === "SKIPPED").length;
            const countCls = t === "irrelevant" ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-600";
            return (
              <button
                key={t}
                onClick={() => setLeadTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                  leadTab === t ? "border-black text-black" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "active" ? "Active" : "Irrelevant"}{" "}
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${countCls}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {leadTab === "active" && (
          <LeadTable
            leads={leads.filter((l) => l.status !== "SKIPPED")}
            token={!isViewer ? session?.backendToken : undefined}
            onStatusChange={!isViewer ? onLeadStatusChange : undefined}
          />
        )}
        {leadTab === "irrelevant" && (
          leads.filter((l) => l.status === "SKIPPED").length === 0
            ? <p className="text-sm text-gray-400">No irrelevant leads.</p>
            : <LeadTable
                leads={leads.filter((l) => l.status === "SKIPPED")}
                token={!isViewer ? session?.backendToken : undefined}
                onStatusChange={!isViewer ? onLeadStatusChange : undefined}
              />
        )}
      </>
    )}

    {campaign.mode === "TEST" && !isViewer && (
      <form onSubmit={onAddTestLead} className="mt-3 flex items-center gap-2">
        <input
          type="email"
          placeholder="Add test email address…"
          value={testEmail}
          onChange={(e) => { setTestEmail(e.target.value); setTestLeadError(""); }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:border-gray-500"
        />
        <button
          type="submit"
          disabled={addingTestLead || !testEmail}
          className="text-sm bg-black text-white px-3 py-1.5 rounded disabled:opacity-40"
        >
          {addingTestLead ? "Adding…" : "+ Add"}
        </button>
        {testLeadError && <span className="text-xs text-red-500">{testLeadError}</span>}
      </form>
    )}
  </div>
)}
```

- [ ] **Step 5.3: Run all frontend tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 5.4: Commit**

```bash
git add frontend/src/app/(app)/campaigns/[id]/page.jsx
git commit -m "feat(ui): add tabbed lead table to campaign detail page"
```

---

## Task 6: Upgrade lead detail page — badge + status selector

**Files:**
- Modify: `frontend/src/app/(app)/leads/[id]/page.jsx`

- [ ] **Step 6.1: Replace `leads/[id]/page.jsx`**

Overwrite `frontend/src/app/(app)/leads/[id]/page.jsx` with:

```jsx
"use client";
import { use, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import EmailDraftPanel from "@/components/EmailDraftPanel";
import LeadStatusBadge from "@/components/LeadStatusBadge";

const ALL_STATUSES = [
  "NEW", "CONTACTED", "REPLIED",
  "INTERESTED", "NOT_INTERESTED", "NEUTRAL",
  "CONVERTIBLE", "SKIPPED",
];

const STATUS_LABELS = {
  NEW: "New",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  NEUTRAL: "Neutral",
  CONVERTIBLE: "Convertible",
  SKIPPED: "Irrelevant",
};

export default function LeadDetailPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");

  const isViewer = session?.user?.role === "VIEWER";

  const load = useCallback(async () => {
    if (!session?.backendToken) return;
    try {
      const { lead } = await apiFetch(`/api/leads/${id}`, { token: session.backendToken });
      setLead(lead);
    } catch (e) {
      setError(e.data?.error || e.message);
    }
  }, [session?.backendToken, id]);

  useEffect(() => { load(); }, [load]);

  async function onStatusChange(e) {
    const newStatus = e.target.value;
    setStatusBusy(true);
    setStatusError("");
    const prev = lead.status;
    setLead((l) => ({ ...l, status: newStatus }));
    try {
      await apiFetch(`/api/leads/${id}`, {
        token: session.backendToken,
        method: "PATCH",
        body: { status: newStatus },
      });
    } catch {
      setLead((l) => ({ ...l, status: prev }));
      setStatusError("Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  if (error) return <p className="text-red-600 text-sm">Could not load lead: {error}</p>;
  if (!lead) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-bold">{lead.firstName} {lead.lastName}</h1>
        <p className="text-sm text-gray-600">{lead.title} · {lead.company}</p>
        <p className="text-sm">{lead.email}</p>
        <div className="flex items-center gap-3">
          <LeadStatusBadge status={lead.status} />
          {!isViewer && (
            <select
              value={lead.status}
              onChange={onStatusChange}
              disabled={statusBusy}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}
          {statusError && <span className="text-xs text-red-500">{statusError}</span>}
        </div>
      </div>
      <EmailDraftPanel leadId={lead.id} emails={lead.emails || []} onRefresh={load} />
    </div>
  );
}
```

- [ ] **Step 6.2: Run all frontend tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/app/(app)/leads/[id]/page.jsx
git commit -m "feat(ui): add status badge and selector to lead detail page"
```

---

## Task 7: Smoke test in browser

- [ ] **Step 7.1: Start the dev server**

From the repo root:
```bash
npm run dev:backend &
npm run dev:frontend
```

- [ ] **Step 7.2: Verify the following flows**

1. Go to `/leads` — confirm Active/Irrelevant tabs appear at the top.
2. On a NEW lead row, click **Contacted** — row badge turns blue instantly, no page reload.
3. Click **Irrelevant** on any active lead — row disappears from Active tab; switch to Irrelevant tab and confirm it appears there.
4. On Irrelevant tab, click **Restore** — lead moves back to Active.
5. Go to `/campaigns/<id>` with a RUNNING campaign — confirm Active/Irrelevant tabs appear on the lead table section.
6. Go to `/leads/<id>` — confirm status badge shows, and the dropdown lets you change status.
7. Go to `/campaigns/<id>` with status `AWAITING_LEAD_APPROVAL` — confirm the existing `LeadApprovalTable` is still intact (no tabs, no regression).

- [ ] **Step 7.3: Final commit if any polish fixes made**

```bash
git add -p
git commit -m "fix(ui): polish after smoke test"
```
