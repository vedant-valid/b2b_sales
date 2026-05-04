# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the app from a developer dashboard into a plain-English sales tool that a non-technical user can navigate without documentation.

**Architecture:** Frontend-only. One shared `campaignStatus.js` utility provides human labels + action-needed logic consumed across all pages. Layout nav is extracted to a client `Sidebar` component so `usePathname()` can drive the active indicator. New presentational components (`StepBar`, `ActionCard`, `FilterEditor`) are dropped into the campaign detail page. No new backend endpoints needed — `GET /api/auth/me` was added in the preceding fix commit.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 4, Vitest + @testing-library/react

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/campaignStatus.js` | **Create** | Status label map, action-needed set, helper fns |
| `src/components/Sidebar.jsx` | **Create** | Client nav with active state, icons, credits |
| `src/app/(app)/layout.jsx` | **Modify** | Import Sidebar, remove inline nav |
| `src/app/(app)/dashboard/page.jsx` | **Modify** | Attention strip, pipeline stats, recent campaigns |
| `src/app/(app)/campaigns/page.jsx` | **Modify** | Use campaignStatus helpers, empty state |
| `src/app/(app)/campaigns/[id]/page.jsx` | **Modify** | StepBar, ActionCard, FilterEditor, job text |
| `src/components/StepBar.jsx` | **Create** | Campaign step progress indicator |
| `src/components/ActionCard.jsx` | **Create** | Status-driven action panel |
| `src/components/FilterEditor.jsx` | **Create** | Structured filter form replacing JSON textarea |
| `src/app/(app)/leads/page.jsx` | **Modify** | Helper text, avatar column, not-unlocked pill, empty states |
| `src/app/(app)/replies/page.jsx` | **Modify** | Empty state, helper text |
| `src/components/CampaignWizard.jsx` | **Modify** | Helper text per step |
| `src/components/JobProgressBar.jsx` | **Modify** | Human-readable state messages |

---

## Task 1: `campaignStatus.js` — shared status utility

**Files:**
- Create: `frontend/src/lib/campaignStatus.js`

- [ ] **Step 1.1: Create the file**

Create `frontend/src/lib/campaignStatus.js`:

```js
export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: "Draft",
  RUNNING: "Running…",
  AWAITING_LEAD_SELECTION: "Review Leads",
  AWAITING_LEAD_APPROVAL: "Approve Leads",
  AWAITING_EMAIL_APPROVAL: "Approve Emails",
  READY_FOR_OUTREACH: "Sending…",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

export const CAMPAIGN_STATUS_NEEDS_ACTION = new Set([
  "AWAITING_LEAD_SELECTION",
  "AWAITING_LEAD_APPROVAL",
  "AWAITING_EMAIL_APPROVAL",
]);

export function campaignStatusLabel(status) {
  return CAMPAIGN_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function campaignStatusNeedsAction(status) {
  return CAMPAIGN_STATUS_NEEDS_ACTION.has(status);
}
```

- [ ] **Step 1.2: Commit**

```bash
git add frontend/src/lib/campaignStatus.js
git commit -m "feat(ui): add campaignStatus utility with human labels and action-needed set"
```

---

## Task 2: `Sidebar` — active nav, icons, credits

**Files:**
- Create: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/app/(app)/layout.jsx`

- [ ] **Step 2.1: Create `Sidebar.jsx`**

Create `frontend/src/components/Sidebar.jsx`:

```jsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: "📊" },
  { href: "/campaigns",  label: "Campaigns",  icon: "📣" },
  { href: "/leads",      label: "Leads",      icon: "👥" },
  { href: "/replies",    label: "Replies",    icon: "💬" },
  { href: "/export",     label: "Export",     icon: "↓"  },
  { href: "/settings",   label: "Settings",   icon: "⚙"  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/auth/me", { token: session.backendToken })
      .then(({ user }) => setCredits(user.credits))
      .catch(() => {});
  }, [session?.backendToken]);

  return (
    <nav className="w-52 border-r bg-gray-50 flex flex-col shrink-0">
      <div className="flex-1 p-3 space-y-0.5 pt-4">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? "bg-white border-l-2 border-black font-semibold text-black shadow-sm"
                  : "text-gray-600 hover:bg-gray-200 border-l-2 border-transparent"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </div>
      {credits !== null && (
        <div className="px-4 py-3 border-t text-xs text-gray-500">
          <span className="font-medium text-gray-700">{credits}</span> credits remaining
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 2.2: Update `layout.jsx` to use Sidebar**

Replace the contents of `frontend/src/app/(app)/layout.jsx`:

```jsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import AuthWatcher from "@/components/AuthWatcher";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex justify-between items-center bg-white">
        <span className="font-bold text-lg tracking-tight">Outreach</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {session.user.email} · {session.user.role}
          </span>
          <LogoutButton />
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <AuthWatcher />
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.3: Verify in browser**

Start the dev server (`npm run dev:frontend` from repo root). Open any page. Confirm:
- Current page link has black left border + bold text
- Credits appear at bottom of sidebar after load
- All 6 nav links work

- [ ] **Step 2.4: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/app/\(app\)/layout.jsx
git commit -m "feat(ui): active nav sidebar with icons and credits display"
```

---

## Task 3: Dashboard overhaul

**Files:**
- Modify: `frontend/src/app/(app)/dashboard/page.jsx`

- [ ] **Step 3.1: Replace dashboard page**

Overwrite `frontend/src/app/(app)/dashboard/page.jsx`:

```jsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { campaignStatusLabel, campaignStatusNeedsAction } from "@/lib/campaignStatus";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [replies, setReplies] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    Promise.all([
      apiFetch("/api/campaigns", { token: session.backendToken }),
      apiFetch("/api/leads", { token: session.backendToken }),
      apiFetch("/api/replies", { token: session.backendToken }),
    ]).then(([c, l, r]) => {
      setCampaigns(c.campaigns || []);
      setLeads(l.leads || []);
      setReplies(r.replies || []);
    }).catch(() => {});
  }, [session?.backendToken]);

  const needsAction = campaigns.filter(c => campaignStatusNeedsAction(c.status));
  const recentCampaigns = [...campaigns].slice(0, 5);

  const activeLeads    = leads.filter(l => l.status !== "SKIPPED").length;
  const contacted      = leads.filter(l => l.status === "CONTACTED").length;
  const interested     = leads.filter(l => ["INTERESTED", "CONVERTIBLE"].includes(l.status)).length;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Link href="/campaigns/new" className="bg-black text-white px-4 py-2 rounded text-sm">
          + New campaign
        </Link>
      </div>

      {/* Attention strip */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Needs your attention</h2>
        {needsAction.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-3">
            <span>✓</span>
            <span>You&apos;re all caught up — no campaigns waiting on you right now.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {needsAction.map(c => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex items-center justify-between border rounded px-4 py-3 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500">{campaignStatusLabel(c.status)}</div>
                  </div>
                </div>
                <span className="text-xs text-gray-400 group-hover:text-gray-700">Go →</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Pipeline stats */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Pipeline</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active leads",  value: activeLeads,      href: "/leads"   },
            { label: "Contacted",     value: contacted,         href: "/leads"   },
            { label: "Replies",       value: replies.length,    href: "/replies" },
            { label: "Interested",    value: interested,        href: "/leads"   },
          ].map(({ label, value, href }) => (
            <Link key={label} href={href} className="border rounded p-4 hover:bg-gray-50 transition-colors">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-2xl font-bold">{value}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent campaigns */}
      {recentCampaigns.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Recent campaigns</h2>
          <div className="border rounded divide-y">
            {recentCampaigns.map(c => (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-sm">
                <span className="font-medium">{c.name}</span>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{c._count?.leads ?? 0} leads</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    campaignStatusNeedsAction(c.status) ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {campaignStatusLabel(c.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {campaigns.length === 0 && (
        <div className="text-center py-16 text-gray-500 space-y-3">
          <p className="text-lg font-medium">No campaigns yet</p>
          <p className="text-sm">Create your first campaign to start reaching leads.</p>
          <Link href="/campaigns/new" className="inline-block bg-black text-white px-4 py-2 rounded text-sm mt-2">
            + New campaign
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3.2: Verify in browser**

Open `/dashboard`. Confirm:
- "Needs your attention" shows campaigns in AWAITING_* states with amber dot
- "You're all caught up" banner shows when none
- 4 pipeline stat cards show correct counts
- Recent campaigns list shows with human status labels
- Empty state appears when no campaigns exist

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/app/\(app\)/dashboard/page.jsx
git commit -m "feat(ui): dashboard with attention strip, pipeline stats, and recent campaigns"
```

---

## Task 4: `StepBar` — campaign progress indicator

**Files:**
- Create: `frontend/src/components/StepBar.jsx`

- [ ] **Step 4.1: Create `StepBar.jsx`**

Create `frontend/src/components/StepBar.jsx`:

```jsx
const STEPS = ["Setup", "Find Leads", "Review Leads", "Send Emails", "Done"];

function statusToStep(status) {
  const map = {
    DRAFT: 1,
    RUNNING: 2,
    AWAITING_LEAD_SELECTION: 3,
    AWAITING_LEAD_APPROVAL: 4,
    AWAITING_EMAIL_APPROVAL: 4,
    READY_FOR_OUTREACH: 4,
    PAUSED: null,
    COMPLETED: 5,
  };
  return map[status] ?? 1;
}

export default function StepBar({ status }) {
  const current = statusToStep(status);
  const isPaused = status === "PAUSED";

  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const done = current !== null && stepNum < current;
        const active = !isPaused && stepNum === current;
        const future = current === null || stepNum > current;

        return (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                done   ? "bg-black text-white" :
                active ? "bg-black text-white ring-2 ring-black ring-offset-2" :
                         "bg-gray-200 text-gray-400"
              }`}>
                {done ? "✓" : stepNum}
              </div>
              <span className={`text-xs whitespace-nowrap ${active ? "font-semibold text-black" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 ${done ? "bg-black" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
      {isPaused && (
        <span className="ml-3 text-xs text-orange-600 font-medium shrink-0">Paused</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4.2: Commit**

```bash
git add frontend/src/components/StepBar.jsx
git commit -m "feat(ui): StepBar component for campaign progress"
```

---

## Task 5: `ActionCard` — status-driven action panel

**Files:**
- Create: `frontend/src/components/ActionCard.jsx`

- [ ] **Step 5.1: Create `ActionCard.jsx`**

Create `frontend/src/components/ActionCard.jsx`:

```jsx
export default function ActionCard({ campaign, leads, skippedIds, unlocking, acting, unlockError, onUnlockLeads, onAction }) {
  const { status } = campaign;
  const selectedCount = leads.filter(l => !skippedIds.has(l.id)).length;
  const totalLeads = leads.length;

  if (status === "AWAITING_LEAD_SELECTION") {
    return (
      <div className="border border-purple-300 bg-purple-50 rounded-lg p-5 space-y-3">
        <div>
          <p className="font-semibold text-purple-900 text-base">
            {totalLeads} lead{totalLeads !== 1 ? "s" : ""} found — review and select the ones you want to contact
          </p>
          <p className="text-sm text-purple-700 mt-1">
            Unlocking costs 1 credit per lead. Credits are only charged after you confirm.
          </p>
        </div>
        {unlockError && <p className="text-sm text-red-600">{unlockError}</p>}
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={onUnlockLeads}
            disabled={unlocking || selectedCount === 0}
            className="bg-purple-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
          >
            {unlocking ? "Unlocking…" : `Unlock ${selectedCount} lead${selectedCount !== 1 ? "s" : ""} — ${selectedCount} credit${selectedCount !== 1 ? "s" : ""}`}
          </button>
          <button
            onClick={() => onAction("reject-leads")}
            disabled={acting}
            className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Discard all &amp; start over
          </button>
        </div>
      </div>
    );
  }

  if (status === "AWAITING_LEAD_APPROVAL") {
    const approveCount = totalLeads - skippedIds.size;
    return (
      <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-5 space-y-3">
        <p className="font-semibold text-yellow-900 text-base">
          {totalLeads} lead{totalLeads !== 1 ? "s" : ""} ready — skip any you don&apos;t want, then approve the rest
        </p>
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={() => onAction("approve-leads")}
            disabled={acting || approveCount === 0}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
          >
            Approve {approveCount} lead{approveCount !== 1 ? "s" : ""} — generate emails
          </button>
          <button
            onClick={() => onAction("reject-leads")}
            disabled={acting}
            className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Reject all
          </button>
        </div>
      </div>
    );
  }

  if (status === "AWAITING_EMAIL_APPROVAL") {
    return (
      <div className="border border-blue-300 bg-blue-50 rounded-lg p-5 space-y-3">
        <p className="font-semibold text-blue-900 text-base">
          Emails drafted — review them below, then launch the campaign
        </p>
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={() => onAction("approve-emails")}
            disabled={acting}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
          >
            Approve &amp; launch
          </button>
          <button
            onClick={() => onAction("reject-emails")}
            disabled={acting}
            className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Reject — start over
          </button>
        </div>
      </div>
    );
  }

  if (status === "RUNNING" || status === "READY_FOR_OUTREACH") {
    return (
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-5">
        <p className="font-semibold text-blue-900 text-base">Campaign is running — emails are being sent</p>
        <p className="text-sm text-blue-700 mt-1">Replies will appear automatically in the Replies tab when leads respond.</p>
      </div>
    );
  }

  if (status === "COMPLETED") {
    const contacted = leads.filter(l => l.status === "CONTACTED").length;
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-5">
        <p className="font-semibold text-green-900 text-base">Campaign complete</p>
        <p className="text-sm text-green-700 mt-1">
          {contacted} lead{contacted !== 1 ? "s" : ""} contacted.{" "}
          <a href="/replies" className="underline">Check the Replies page</a> for responses.
        </p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add frontend/src/components/ActionCard.jsx
git commit -m "feat(ui): ActionCard component with plain-English status-driven actions"
```

---

## Task 6: `FilterEditor` — structured filter form

**Files:**
- Create: `frontend/src/components/FilterEditor.jsx`

- [ ] **Step 6.1: Create `FilterEditor.jsx`**

Create `frontend/src/components/FilterEditor.jsx`:

```jsx
"use client";
import { useState } from "react";

const FIELDS = [
  { key: "locations",            label: "Locations",            hint: "e.g. India, United States" },
  { key: "companySizes",         label: "Company sizes",        hint: "e.g. 11-50, 51-200" },
  { key: "seniorities",          label: "Seniority levels",     hint: "e.g. c-suite, director, manager" },
  { key: "departments",          label: "Departments",          hint: "e.g. Engineering & Technical, Product" },
  { key: "titleKeywords",        label: "Job title keywords",   hint: "e.g. cto, head of engineering" },
  { key: "excludeTitleKeywords", label: "Exclude job titles",   hint: "e.g. ciso, security" },
  { key: "excludeIndustries",    label: "Exclude industries",   hint: "e.g. Hospitality, Healthcare" },
];

function toArray(str) {
  return str.split(",").map(s => s.trim()).filter(Boolean);
}

function fromArray(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

export default function FilterEditor({ initialFilters, onRerun, rerunning }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map(f => [f.key, fromArray(initialFilters?.[f.key] ?? [])]))
  );
  const [error, setError] = useState("");

  function handleSubmit() {
    setError("");
    const filters = {};
    for (const { key } of FIELDS) {
      const arr = toArray(values[key]);
      if (arr.length > 0) filters[key] = arr;
    }
    if (Object.keys(filters).length === 0) {
      setError("Add at least one filter before re-running.");
      return;
    }
    onRerun(filters);
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label className={`block text-xs font-medium mb-1 ${key.startsWith("exclude") ? "text-red-600" : "text-gray-600"}`}>
              {label}
            </label>
            <input
              type="text"
              value={values[key]}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              placeholder={hint}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={rerunning}
        className="bg-purple-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50 font-medium"
      >
        {rerunning ? "Re-running…" : "Re-run with these filters"}
      </button>
    </div>
  );
}
```

- [ ] **Step 6.2: Commit**

```bash
git add frontend/src/components/FilterEditor.jsx
git commit -m "feat(ui): FilterEditor replaces raw JSON textarea with structured inputs"
```

---

## Task 7: `JobProgressBar` — human-readable messages

**Files:**
- Modify: `frontend/src/components/JobProgressBar.jsx`

- [ ] **Step 7.1: Update JobProgressBar**

Replace the return statement in `frontend/src/components/JobProgressBar.jsx`:

```jsx
  if (!job) return <p className="text-sm text-gray-500 animate-pulse">Finding leads… this usually takes 20–30 seconds</p>;

  const messages = {
    completed: "Done — leads loaded below",
    failed: "Something went wrong. Try running the campaign again.",
  };

  return (
    <div className={`text-sm ${job.state === "failed" ? "text-red-600" : "text-gray-500"}`}>
      {messages[job.state] ?? "Finding leads… this usually takes 20–30 seconds"}
      {job.retryCount > 0 && <span className="text-amber-600 ml-2">(retrying…)</span>}
    </div>
  );
```

- [ ] **Step 7.2: Commit**

```bash
git add frontend/src/components/JobProgressBar.jsx
git commit -m "feat(ui): human-readable job progress messages"
```

---

## Task 8: Campaign detail page — wire StepBar, ActionCard, FilterEditor

**Files:**
- Modify: `frontend/src/app/(app)/campaigns/[id]/page.jsx`

- [ ] **Step 8.1: Add imports**

At the top of `frontend/src/app/(app)/campaigns/[id]/page.jsx`, add to the existing import block:

```jsx
import StepBar from "@/components/StepBar";
import ActionCard from "@/components/ActionCard";
import FilterEditor from "@/components/FilterEditor";
import { campaignStatusLabel } from "@/lib/campaignStatus";
```

- [ ] **Step 8.2: Replace status text with StepBar + human label**

Find this block:
```jsx
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-gray-600">Status: {campaign.status}</p>
        </div>
        {!isViewer && campaign.status === "DRAFT" && (
          <button onClick={onRun} className="bg-black text-white px-3 py-2 rounded text-sm">
            Run campaign
          </button>
        )}
      </div>
```

Replace with:
```jsx
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold">{campaign.name}</h1>
            <p className="text-sm text-gray-500">{campaignStatusLabel(campaign.status)}</p>
          </div>
          {!isViewer && campaign.status === "DRAFT" && (
            <button onClick={onRun} className="bg-black text-white px-3 py-2 rounded text-sm">
              Run campaign
            </button>
          )}
        </div>
        <StepBar status={campaign.status} />
      </div>
```

- [ ] **Step 8.3: Replace the AWAITING_LEAD_SELECTION block**

Find this entire block (starts with `{campaign.status === "AWAITING_LEAD_SELECTION" && !isViewer && (`):

Replace the entire `AWAITING_LEAD_SELECTION` block and `AWAITING_LEAD_APPROVAL` block and `AWAITING_EMAIL_APPROVAL` block with a single `<ActionCard>` call:

```jsx
      {!isViewer && (
        <ActionCard
          campaign={campaign}
          leads={leads}
          skippedIds={skippedIds}
          unlocking={unlocking}
          acting={acting}
          unlockError={unlockError}
          onUnlockLeads={onUnlockLeads}
          onAction={onAction}
        />
      )}
```

- [ ] **Step 8.4: Replace the filter edit section with FilterEditor**

Find this block inside the `AWAITING_LEAD_SELECTION` panel (now inside ActionCard, so we put the FilterEditor BELOW ActionCard):

After the `<ActionCard ... />` line add:

```jsx
      {campaign.status === "AWAITING_LEAD_SELECTION" && !isViewer && (
        <div className="border border-gray-200 rounded-lg p-4">
          <button
            onClick={() => {
              setFilterDraft(JSON.stringify(campaign.extractedFilters, null, 2));
              setFilterError("");
              setEditingFilters(v => !v);
            }}
            className="text-sm text-gray-600 underline"
          >
            {editingFilters ? "Cancel" : "Not happy with these leads? Edit filters and re-run →"}
          </button>
          {editingFilters && (
            <FilterEditor
              initialFilters={campaign.extractedFilters}
              onRerun={async (filters) => {
                setFilterError("");
                setRerunning(true);
                try {
                  const { jobId: jid } = await apiFetch(`/api/campaigns/${id}/rerun-with-filters`, {
                    token: session.backendToken, method: "POST", body: { filters }
                  });
                  setEditingFilters(false);
                  setJobId(jid);
                  setLeads([]);
                  loadCampaign();
                } catch (e) { setFilterError(e.message); }
                finally { setRerunning(false); }
              }}
              rerunning={rerunning}
            />
          )}
          {filterError && <p className="text-xs text-red-600 mt-2">{filterError}</p>}
        </div>
      )}
```

- [ ] **Step 8.5: Verify in browser**

Open a campaign in each of these states and confirm the UI renders correctly:
- DRAFT — shows "Run campaign" button + StepBar at step 1
- AWAITING_LEAD_SELECTION — shows ActionCard with purple unlock panel + FilterEditor toggle
- AWAITING_LEAD_APPROVAL — shows ActionCard with yellow approve panel
- AWAITING_EMAIL_APPROVAL — shows ActionCard with blue emails panel
- RUNNING — shows ActionCard with "emails are being sent"
- COMPLETED — shows ActionCard with completion message

- [ ] **Step 8.6: Commit**

```bash
git add frontend/src/app/\(app\)/campaigns/\[id\]/page.jsx
git commit -m "feat(ui): campaign detail with StepBar, ActionCard, and FilterEditor"
```

---

## Task 9: Leads page — helper text, avatar, not-unlocked pill, empty states

**Files:**
- Modify: `frontend/src/app/(app)/leads/page.jsx`

- [ ] **Step 9.1: Add helper text and empty states**

At the top of `LeadsPage`'s return, after `<h1>`, add:

```jsx
      <p className="text-sm text-gray-500 -mt-4">
        These are the people your campaigns are reaching out to. Use the tabs to focus on what needs action.
      </p>
```

Replace the empty state in the `LeadTable` for outreach (when `activeOutreach.length === 0`):

In the `Section` component's empty message for Outreach, change it to:
```jsx
empty="No outreach leads yet — run a campaign to start finding people."
```

And for Testing:
```jsx
empty="No test leads yet."
```

And when `leads.length === 0` overall, add before the tab bar:
```jsx
      {leads.length === 0 && (
        <div className="text-center py-16 text-gray-500 space-y-3">
          <p className="text-lg font-medium">No leads yet</p>
          <p className="text-sm">Run a campaign to start finding people to reach out to.</p>
          <a href="/campaigns" className="inline-block text-sm underline text-gray-700 mt-1">Go to Campaigns →</a>
        </div>
      )}
```

- [ ] **Step 9.2: Update LeadTable to show "Not unlocked" pill for leads without email**

In `frontend/src/components/LeadTable.jsx`, find the email column:
```jsx
            <td className="pr-3">{l.email ?? "—"}</td>
```

Replace with:
```jsx
            <td className="pr-3">
              {l.email
                ? l.email
                : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Not unlocked</span>
              }
            </td>
```

- [ ] **Step 9.3: Add company initial avatar to LeadTable**

In `frontend/src/components/LeadTable.jsx`, add a helper above the component:

```jsx
function CompanyAvatar({ company }) {
  const letter = (company || "?")[0].toUpperCase();
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-green-100 text-green-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
  ];
  const idx = (company || "?").charCodeAt(0) % colors.length;
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${colors[idx]}`}>
      {letter}
    </span>
  );
}
```

Add an avatar column before the Name column in both `<thead>` and `<tbody>`:

In `<thead>`:
```jsx
          <th className="pb-1 pr-2 w-8"></th>
          <th className="pb-1 pr-3">Name</th>
```

In `<tbody>` row:
```jsx
            <td className="py-2 pr-2">
              <CompanyAvatar company={l.company} />
            </td>
            <td className="py-2 pr-3">
```

- [ ] **Step 9.4: Verify in browser**

Open `/leads`. Confirm:
- Helper text shows below the heading
- Each row has a colored company initial circle
- Leads without email show "Not unlocked" pill
- Empty state shows when no leads exist

- [ ] **Step 9.5: Commit**

```bash
git add frontend/src/app/\(app\)/leads/page.jsx frontend/src/components/LeadTable.jsx
git commit -m "feat(ui): leads page with helper text, company avatars, not-unlocked pill, and empty states"
```

---

## Task 10: Replies page — empty state and helper text

**Files:**
- Modify: `frontend/src/app/(app)/replies/page.jsx`

- [ ] **Step 10.1: Add empty state and helper text**

After `<h1 className="text-xl font-bold">Replies</h1>` add:

```jsx
        <p className="text-sm text-gray-500 mt-1">
          Replies appear here automatically when leads respond to your emails.
        </p>
```

After the `GROUPS.map(...)` block, add a global empty state when all groups are empty:

```jsx
      {replies.length === 0 && (
        <div className="text-center py-16 text-gray-400 space-y-2">
          <p className="text-lg font-medium text-gray-500">No replies yet</p>
          <p className="text-sm">When leads respond to your emails, they&apos;ll show up here — grouped by how interested they seem.</p>
        </div>
      )}
```

Replace each group's `<p className="text-sm text-gray-400 pl-1">None.</p>` with nothing — hide empty groups entirely:

```jsx
            {grouped.length === 0 ? null : (
              <div className={`space-y-3 border rounded-lg p-4 ${group.style}`}>
                {grouped.map((r) => <ReplyCard key={r.id} reply={r} onApproved={(id) => setReplies(prev => prev.filter(r => r.id !== id))} />)}
              </div>
            )}
```

Also wrap the section so it only renders when the group has items:

```jsx
      {GROUPS.map((group) => {
        const grouped = replies.filter((r) => group.sentiments.includes(r.sentiment));
        if (grouped.length === 0) return null;
        return (
          <section key={group.key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">{group.label}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${group.badge}`}>{grouped.length}</span>
              <span className="text-xs text-gray-400 italic">{group.action}</span>
            </div>
            <div className={`space-y-3 border rounded-lg p-4 ${group.style}`}>
              {grouped.map((r) => <ReplyCard key={r.id} reply={r} onApproved={(id) => setReplies(prev => prev.filter(r => r.id !== id))} />)}
            </div>
          </section>
        );
      })}
```

- [ ] **Step 10.2: Commit**

```bash
git add frontend/src/app/\(app\)/replies/page.jsx
git commit -m "feat(ui): replies page empty state, helper text, hide empty sentiment groups"
```

---

## Task 11: CampaignWizard — helper text per step

**Files:**
- Modify: `frontend/src/components/CampaignWizard.jsx`

- [ ] **Step 11.1: Read current wizard structure**

Read `frontend/src/components/CampaignWizard.jsx` fully before editing — the wizard is a single-step form (not a multi-step wizard), so helper text goes above the form fields.

- [ ] **Step 11.2: Add helper text above each field group**

In `frontend/src/components/CampaignWizard.jsx`, inside the `<form>`:

After the mode toggle buttons and before the name input, add a section header:

```jsx
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        Describe who you want to reach and why — we&apos;ll extract the targeting filters automatically using AI.
      </div>
```

Above the `rawGoal` textarea, add a label with helper text:

```jsx
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Campaign goal
          <span className="font-normal text-gray-500 ml-2 text-xs">Describe in plain English who you want to reach and why</span>
        </label>
        <textarea ... />
      </div>
```

If mode is TEST, add helper text above the email input:

```jsx
      {mode === "TEST" && (
        <div className="space-y-2">
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Demo mode — emails go to the addresses below instead of real leads. Use this to test the flow end-to-end.
          </div>
          {/* existing test email textarea */}
        </div>
      )}
```

- [ ] **Step 11.3: Verify in browser**

Open `/campaigns/new`. Confirm:
- Blue helper banner appears at the top of the form
- Campaign goal field has inline label hint
- Test mode shows amber info box

- [ ] **Step 11.4: Commit**

```bash
git add frontend/src/components/CampaignWizard.jsx
git commit -m "feat(ui): campaign wizard helper text for non-technical users"
```

---

## Task 12: Campaigns page — human labels and empty state

**Files:**
- Modify: `frontend/src/app/(app)/campaigns/page.jsx`

- [ ] **Step 12.1: Import and use campaignStatus helpers**

At the top of `frontend/src/app/(app)/campaigns/page.jsx`, add:

```jsx
import { campaignStatusLabel, campaignStatusNeedsAction } from "@/lib/campaignStatus";
```

Replace the `StatusBadge` component (already updated in the prior fix commit) to also use the shared helper:

```jsx
function StatusBadge({ status }) {
  const needsAction = campaignStatusNeedsAction(status);
  const colours = {
    DRAFT: "bg-gray-100 text-gray-700",
    RUNNING: "bg-blue-100 text-blue-700",
    AWAITING_LEAD_SELECTION: "bg-amber-100 text-amber-700",
    AWAITING_LEAD_APPROVAL: "bg-yellow-100 text-yellow-700",
    AWAITING_EMAIL_APPROVAL: "bg-purple-100 text-purple-700",
    READY_FOR_OUTREACH: "bg-blue-100 text-blue-700",
    PAUSED: "bg-orange-100 text-orange-700",
    COMPLETED: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${colours[status] ?? "bg-gray-100 text-gray-600"}`}>
      {needsAction && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />}
      {campaignStatusLabel(status)}
    </span>
  );
}
```

- [ ] **Step 12.2: Add empty state to CampaignTable**

Replace:
```jsx
  if (items.length === 0) return <p className="text-sm text-gray-400 py-2">None yet.</p>;
```

With:
```jsx
  if (items.length === 0) return (
    <div className="py-6 text-center text-gray-400 text-sm space-y-2">
      <p>No campaigns here yet.</p>
      <a href="/campaigns/new" className="text-gray-600 underline text-sm">Create one →</a>
    </div>
  );
```

- [ ] **Step 12.3: Commit**

```bash
git add frontend/src/app/\(app\)/campaigns/page.jsx
git commit -m "feat(ui): campaigns page uses shared status helpers and improved empty states"
```

---

## Self-Review

**Spec coverage:**
- [x] Status label translations → Task 1 (`campaignStatus.js`) + Task 12
- [x] Active nav indicator + icons → Task 2 (`Sidebar.jsx`)
- [x] Credits in header → Task 2 (Sidebar footer, via `GET /api/auth/me`)
- [x] Dashboard attention strip → Task 3
- [x] Dashboard pipeline stats → Task 3
- [x] Dashboard recent campaigns → Task 3
- [x] StepBar progress indicator → Task 4 + Task 8
- [x] ActionCard replaces colored boxes → Task 5 + Task 8
- [x] Structured filter editor → Task 6 + Task 8
- [x] Job progress human text → Task 7
- [x] Leads helper text + empty states → Task 9
- [x] Company avatar column → Task 9
- [x] Not-unlocked pill → Task 9
- [x] Replies empty state + hide empty groups → Task 10
- [x] Campaign wizard helper text → Task 11
- [x] Campaigns page empty state → Task 12

**No placeholders found.**

**Type consistency:** `onAction`, `onUnlockLeads`, `skippedIds`, `unlocking`, `acting`, `unlockError` passed to `ActionCard` match the names in `campaigns/[id]/page.jsx`. `FilterEditor.onRerun(filters)` matches the inline handler in Task 8.4. `StepBar.status` is a string, passed as `{campaign.status}` — consistent throughout.
