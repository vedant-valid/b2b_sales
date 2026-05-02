# Lead Scoring & HITL Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI fit scoring to every lead at fetch time and replace the bulk "Approve All" button with a per-lead approve/skip UI that only sends approved leads to email generation.

**Architecture:** A new `services/leadScoring.js` module makes a single batched Gemini call after all leads are upserted, storing `fitScore` (0–100) and `fitReasoning` (String[]) on each Lead row. The existing `approve-leads` route is extended to accept an `approvedIds` list; omitting it preserves the old bulk behaviour. The frontend gains a `LeadApprovalTable` component with score badges and skip/undo per row, plus a sticky footer with a counter and confirm button.

**Tech Stack:** Prisma + PostgreSQL, Express/Zod, `@google/generative-ai` via `services/gemini.js`, Next.js 15 App Router, React 19, Tailwind 4.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/prisma/schema.prisma` | Add `fitScore Int?` and `fitReasoning Json?` to `Lead` |
| Create | `backend/services/leadScoring.js` | Batched Gemini scoring; injectable for tests |
| Create | `backend/tests/services/leadScoring.test.js` | Unit tests for scoring service |
| Modify | `backend/workers/fetchLeads.js` | Call scoring after upsert; add `__setScoringImpl` |
| Modify | `backend/tests/workers/fetchLeads.test.js` | Mock scoring; add score-persisted test |
| Modify | `backend/routes/campaigns.js` | `approve-leads` accepts `approvedIds`, skips non-approved |
| Modify | `backend/tests/routes/campaigns.test.js` | Test `approve-leads` with `approvedIds` |
| Create | `frontend/src/components/LeadApprovalTable.jsx` | Score badge, reasoning bullets, skip/undo per row |
| Modify | `frontend/src/app/(app)/campaigns/[id]/page.jsx` | Wire `LeadApprovalTable` + sticky footer |

---

## Task 1: Schema Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the two nullable fields to the Lead model**

Open `backend/prisma/schema.prisma`. Find the `model Lead` block (currently ends at the `createdAt` field). Add two lines immediately before the closing `}`:

```prisma
model Lead {
  id            String     @id @default(cuid())
  lushaPersonId String?    @unique
  firstName     String
  lastName      String
  email         String?
  phone         String?
  title         String?
  company       String?
  location      String?
  linkedinUrl   String?
  department    String?
  seniority     String?
  status        LeadStatus @default(NEW)
  fitScore      Int?
  fitReasoning  Json?
  campaign      Campaign   @relation(fields: [campaignId], references: [id])
  campaignId    String
  emails        Email[]
  replies       Reply[]
  createdAt     DateTime   @default(now())
}
```

- [ ] **Step 2: Run the migration**

```bash
cd backend && npm run prisma:migrate
```

When prompted for a name, type: `add_fit_score_to_lead`

Expected: Migration applied successfully. No data loss (both fields nullable).

- [ ] **Step 3: Regenerate the Prisma client**

```bash
npm run prisma:generate
```

Expected: `Generated Prisma Client` message with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(schema): add fitScore and fitReasoning to Lead"
```

---

## Task 2: Lead Scoring Service (TDD)

**Files:**
- Create: `backend/tests/services/leadScoring.test.js`
- Create: `backend/services/leadScoring.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/leadScoring.test.js`:

```js
import { jest } from "@jest/globals";
import { scoreLeads, __setGeminiImpl } from "../../services/leadScoring.js";

const mockLeads = [
  { id: "lead-1", firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme AI", location: "India", seniority: "director" },
  { id: "lead-2", firstName: "Bob", lastName: "Jones", title: "IT Manager", company: "Corp", location: "India", seniority: "manager" }
];

describe("scoreLeads", () => {
  test("returns score and bullets for each lead", async () => {
    __setGeminiImpl(jest.fn().mockResolvedValue([
      { leadId: "lead-1", score: 85, bullets: ["Senior engineering title", "AI startup", "India market", "No significant gaps"] },
      { leadId: "lead-2", score: 38, bullets: ["IT role, not engineering leadership", "Large corp, not startup", "India market", "Title mismatch with goal"] }
    ]));

    const result = await scoreLeads("Find CTOs at AI startups in India", mockLeads);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      leadId: "lead-1",
      score: 85,
      bullets: ["Senior engineering title", "AI startup", "India market", "No significant gaps"]
    });
    expect(result[1].score).toBe(38);
    expect(result[1].bullets).toHaveLength(4);
  });

  test("returns empty array when Gemini returns non-array", async () => {
    __setGeminiImpl(jest.fn().mockResolvedValue("not an array"));

    const result = await scoreLeads("Find CTOs", mockLeads);

    expect(result).toEqual([]);
  });

  test("returns empty array when Gemini throws", async () => {
    __setGeminiImpl(jest.fn().mockRejectedValue(new Error("API unavailable")));

    const result = await scoreLeads("Find CTOs", mockLeads);

    expect(result).toEqual([]);
  });

  test("filters out malformed entries missing required fields", async () => {
    __setGeminiImpl(jest.fn().mockResolvedValue([
      { leadId: "lead-1", score: 85, bullets: ["Good title", "Good company", "India", "No gaps"] },
      { score: 70, bullets: ["Missing leadId"] },
      { leadId: "lead-2", bullets: ["Missing score"] },
      { leadId: "lead-2", score: "not-a-number", bullets: ["Bad score type"] }
    ]));

    const result = await scoreLeads("Find CTOs", mockLeads);

    expect(result).toHaveLength(1);
    expect(result[0].leadId).toBe("lead-1");
  });

  test("passes rawGoal and compact lead summaries to Gemini", async () => {
    const mockFn = jest.fn().mockResolvedValue([]);
    __setGeminiImpl(mockFn);

    await scoreLeads("Find VP Engineers at fintech", mockLeads);

    expect(mockFn).toHaveBeenCalledTimes(1);
    const calledPrompt = mockFn.mock.calls[0][0];
    expect(calledPrompt).toContain("Find VP Engineers at fintech");
    expect(calledPrompt).toContain("lead-1");
    expect(calledPrompt).toContain("CTO");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest tests/services/leadScoring.test.js --no-coverage
```

Expected: `Cannot find module '../../services/leadScoring.js'`

- [ ] **Step 3: Create the scoring service**

Create `backend/services/leadScoring.js`:

```js
import { generateJson as realGenerateJson } from "./gemini.js";

let generateJson = realGenerateJson;
export function __setGeminiImpl(fn) { generateJson = fn; }

export async function scoreLeads(rawGoal, leads) {
  const summaries = leads.map(l => ({
    leadId: l.id,
    name: `${l.firstName} ${l.lastName}`,
    title: l.title ?? "Unknown",
    company: l.company ?? "Unknown",
    location: l.location ?? "Unknown",
    seniority: l.seniority ?? "Unknown"
  }));

  const prompt = `Campaign goal: ${rawGoal}

Score each lead 0-100 for fit against this goal.
Return a JSON array only — no prose:
[{ "leadId": "...", "score": 85, "bullets": ["...", "...", "..."] }]

Each bullets array must contain 3-4 items covering:
1. Job title alignment
2. Company profile match
3. Location / market fit
4. One gap or concern (or "No significant gaps" if none)

Leads:
${JSON.stringify(summaries)}`;

  try {
    const results = await generateJson(prompt);
    if (!Array.isArray(results)) return [];
    return results.filter(
      r => r.leadId && typeof r.score === "number" && Array.isArray(r.bullets)
    );
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest tests/services/leadScoring.test.js --no-coverage
```

Expected: 5 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/services/leadScoring.js backend/tests/services/leadScoring.test.js
git commit -m "feat(scoring): add lead scoring service with Gemini batch call"
```

---

## Task 3: Wire Scoring into fetchLeads Worker

**Files:**
- Modify: `backend/workers/fetchLeads.js`
- Modify: `backend/tests/workers/fetchLeads.test.js`

- [ ] **Step 1: Update the fetchLeads test — add scoring mock and a score-persisted test**

Replace the entire contents of `backend/tests/workers/fetchLeads.test.js`:

```js
import { jest } from "@jest/globals";
import { runFetchLeadsJob, __setLushaImpl, __setScoringImpl } from "../../workers/fetchLeads.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

beforeEach(async () => {
  await resetDb();
  // Default no-op scoring so tests that don't care about scores still pass
  __setScoringImpl({ scoreLeads: jest.fn().mockResolvedValue([]) });
});

describe("fetchLeads worker", () => {
  test("stores enriched leads and sets status to AWAITING_LEAD_APPROVAL", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-1", firstName: "A", lastName: "B", email: "a@x.com", title: "CTO", company: "Acme", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" },
        { lushaContactId: "uuid-2", firstName: "C", lastName: "D", email: "c@x.com", title: "VP Eng", company: "Beta", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "vice president" }
      ])
    });

    const { user } = await createUser({ role: "MANAGER", email: `u${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: {
        name: "X", rawGoal: "g",
        extractedFilters: { seniorities: ["director"], departments: ["Engineering & Technical"], locations: ["India"] },
        createdById: user.id
      }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(2);
    expect(leads.map(l => l.email)).toEqual(expect.arrayContaining(["a@x.com", "c@x.com"]));

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_APPROVAL");
  });

  test("zero leads from Lusha → campaign COMPLETED", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([])
    });

    const { user } = await createUser({ role: "MANAGER", email: `u2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    await runFetchLeadsJob({ data: { campaignId: campaign.id } });
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  test("persists fitScore and fitReasoning returned by scoring service", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-3", firstName: "E", lastName: "F", email: "e@x.com", title: "CTO", company: "Gamma", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" }
      ])
    });
    // Mock scoring to return dynamic scores based on lead IDs
    __setScoringImpl({
      scoreLeads: jest.fn().mockImplementation(async (_goal, leads) =>
        leads.map(l => ({
          leadId: l.id,
          score: 82,
          bullets: ["Senior title", "Good company", "India market", "No significant gaps"]
        }))
      )
    });

    const { user } = await createUser({ role: "MANAGER", email: `u3${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "Find CTOs in India", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const [lead] = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(lead.fitScore).toBe(82);
    expect(lead.fitReasoning).toEqual(["Senior title", "Good company", "India market", "No significant gaps"]);
  });

  test("scoring failure does not block AWAITING_LEAD_APPROVAL status", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-4", firstName: "G", lastName: "H", email: "g@x.com", title: "CTO", company: "Delta", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" }
      ])
    });
    __setScoringImpl({
      scoreLeads: jest.fn().mockResolvedValue([]) // no scores returned
    });

    const { user } = await createUser({ role: "MANAGER", email: `u4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_APPROVAL");

    const [lead] = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(lead.fitScore).toBeNull();
    expect(lead.fitReasoning).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest tests/workers/fetchLeads.test.js --no-coverage
```

Expected: Tests that import `__setScoringImpl` fail with `__setScoringImpl is not a function`. The original two tests may pass or fail depending on whether the mock import resolves — both outcomes confirm the test is wired correctly.

- [ ] **Step 3: Update the fetchLeads worker**

Replace the entire contents of `backend/workers/fetchLeads.js`:

```js
import { prisma } from "../lib/prisma.js";
import { searchLeads as realSearchLeads } from "../services/lusha.js";
import { scoreLeads as realScoreLeads } from "../services/leadScoring.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "fetch-leads";

let lusha = { searchLeads: realSearchLeads };
export function __setLushaImpl(impl) { lusha = impl; }

let scorer = { scoreLeads: realScoreLeads };
export function __setScoringImpl(impl) { scorer = impl; }

export async function runFetchLeadsJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  const results = await lusha.searchLeads(campaign.extractedFilters);
  logger.info(`fetch-leads: ${results.length} enriched leads for campaign ${campaignId}`);

  if (results.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    return { leadCount: 0 };
  }

  const upsertedLeads = [];
  for (const r of results) {
    const personId = r.lushaContactId ?? `${campaignId}-${r.email}`;
    const lead = await prisma.lead.upsert({
      where: { lushaPersonId: personId },
      update: {},
      create: {
        lushaPersonId: personId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        title: r.title,
        company: r.company,
        location: r.location,
        linkedinUrl: r.linkedinUrl,
        department: r.department,
        seniority: r.seniority,
        campaignId
      }
    });
    upsertedLeads.push(lead);
  }

  // Score leads — errors are caught inside scoreLeads and return []
  const scores = await scorer.scoreLeads(campaign.rawGoal, upsertedLeads);
  if (scores.length > 0) {
    await prisma.$transaction(
      scores.map(({ leadId, score, bullets }) =>
        prisma.lead.update({
          where: { id: leadId },
          data: { fitScore: score, fitReasoning: bullets }
        })
      )
    );
    logger.info(`fetch-leads: scored ${scores.length} leads for campaign ${campaignId}`);
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "AWAITING_LEAD_APPROVAL" } });
  logger.info(`fetch-leads: campaign ${campaignId} awaiting lead approval (${upsertedLeads.length} leads)`);
  return { leadCount: upsertedLeads.length };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runFetchLeadsJob);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest tests/workers/fetchLeads.test.js --no-coverage
```

Expected: 4 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/workers/fetchLeads.js backend/tests/workers/fetchLeads.test.js
git commit -m "feat(worker): score leads after fetch, persist fitScore and fitReasoning"
```

---

## Task 4: Update approve-leads Route

**Files:**
- Modify: `backend/routes/campaigns.js`
- Modify: `backend/tests/routes/campaigns.test.js`

- [ ] **Step 1: Write the new failing tests**

Open `backend/tests/routes/campaigns.test.js`. Inside the `describe("approval gates", ...)` block, add these two tests after the existing `POST /approve-leads` tests:

```js
  test("POST /approve-leads with approvedIds only enqueues approved leads", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `alidx${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({ data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id } }),
      prisma.lead.create({ data: { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id } })
    ]);

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token))
      .send({ approvedIds: [lead1.id] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const skipped = await prisma.lead.findUnique({ where: { id: lead2.id } });
    expect(skipped.status).toBe("SKIPPED");

    const approved = await prisma.lead.findUnique({ where: { id: lead1.id } });
    expect(approved.status).toBe("NEW");

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("POST /approve-leads returns 409 when all leads are skipped via approvedIds", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `alskip${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
    });
    await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token))
      .send({ approvedIds: [] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("no_leads_with_email");
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage -t "approvedIds"
```

Expected: Both new tests FAIL — current route ignores the body entirely.

- [ ] **Step 3: Update the approve-leads route in `backend/routes/campaigns.js`**

Find the existing `router.post("/:id/approve-leads", ...)` handler (lines 158–175) and replace it entirely with:

```js
const approveLeadsSchema = z.object({
  approvedIds: z.array(z.string()).optional()
});

router.post("/:id/approve-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_APPROVAL") return res.status(409).json({ error: "invalid_status" });

    const parsed = approveLeadsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { approvedIds } = parsed.data;

    const allLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id, email: { not: null } }
    });

    let leadsToProcess;
    if (approvedIds !== undefined) {
      const toSkip = allLeads.filter(l => !approvedIds.includes(l.id)).map(l => l.id);
      if (toSkip.length > 0) {
        await prisma.lead.updateMany({ where: { id: { in: toSkip } }, data: { status: "SKIPPED" } });
      }
      leadsToProcess = allLeads.filter(l => approvedIds.includes(l.id));
    } else {
      leadsToProcess = allLeads.filter(l => l.status !== "SKIPPED");
    }

    if (leadsToProcess.length === 0) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
      return res.status(409).json({ error: "no_leads_with_email" });
    }

    const boss = await getBoss();
    for (const lead of leadsToProcess) {
      await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
    }
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run the full campaigns test suite**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage
```

Expected: All tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/campaigns.js backend/tests/routes/campaigns.test.js
git commit -m "feat(route): approve-leads accepts approvedIds for per-lead approval"
```

---

## Task 5: LeadApprovalTable Component

**Files:**
- Create: `frontend/src/components/LeadApprovalTable.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/LeadApprovalTable.jsx`:

```jsx
"use client";
import { useState } from "react";
import Link from "next/link";

function ScoreBadge({ score }) {
  if (score == null) {
    return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">No score</span>;
  }
  const color =
    score >= 70 ? "bg-green-100 text-green-800" :
    score >= 40 ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${color}`}>
      {score}
    </span>
  );
}

function ReasoningCell({ bullets }) {
  const [open, setOpen] = useState(false);
  if (!bullets || bullets.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-600 underline"
      >
        {open ? "▲ Hide" : "▼ Show"}
      </button>
      {open && (
        <ul className="mt-1 text-xs text-gray-700 list-disc list-inside space-y-0.5">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function LeadApprovalTable({ leads, skippedIds, onSkip, onUndoSkip, rowError }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-1 pr-3">Name</th>
            <th className="pr-3">Title</th>
            <th className="pr-3">Company</th>
            <th className="pr-3">Score</th>
            <th className="pr-3">Fit Reasoning</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const skipped = skippedIds.has(l.id);
            return (
              <tr
                key={l.id}
                className={`border-b transition-opacity ${skipped ? "opacity-40" : "hover:bg-gray-50"}`}
              >
                <td className="py-2 pr-3">
                  <Link className="underline" href={`/leads/${l.id}`}>
                    {l.firstName} {l.lastName}
                  </Link>
                </td>
                <td className="pr-3">{l.title ?? "—"}</td>
                <td className="pr-3">{l.company ?? "—"}</td>
                <td className="pr-3"><ScoreBadge score={l.fitScore} /></td>
                <td className="pr-3 max-w-xs"><ReasoningCell bullets={l.fitReasoning} /></td>
                <td>
                  {skipped ? (
                    <button
                      onClick={() => onUndoSkip(l.id)}
                      className="text-xs text-blue-600 underline"
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      onClick={() => onSkip(l.id)}
                      className="text-xs text-red-600 underline"
                    >
                      Skip
                    </button>
                  )}
                  {rowError?.[l.id] && (
                    <span className="text-xs text-red-500 ml-2">{rowError[l.id]}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LeadApprovalTable.jsx
git commit -m "feat(ui): LeadApprovalTable with score badges, reasoning bullets, skip/undo"
```

---

## Task 6: Wire HITL UI into Campaign Detail Page

**Files:**
- Modify: `frontend/src/app/(app)/campaigns/[id]/page.jsx`

- [ ] **Step 1: Replace the campaign detail page with the updated version**

Replace the entire contents of `frontend/src/app/(app)/campaigns/[id]/page.jsx`:

```jsx
"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import FilterPreview from "@/components/FilterPreview";
import JobProgressBar from "@/components/JobProgressBar";
import LeadApprovalTable from "@/components/LeadApprovalTable";
import Link from "next/link";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function CampaignDetailPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  // Per-lead approval state — initialised from DB status on each leads load
  const [skippedIds, setSkippedIds] = useState(new Set());
  const [rowError, setRowError] = useState({});

  const loadCampaign = useCallback(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/campaigns/${id}`, { token: session.backendToken })
      .then(({ campaign }) => setCampaign(campaign))
      .catch((e) => setError(e.message));
  }, [session?.backendToken, id]);

  const loadLeads = useCallback(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/leads?campaignId=${id}`, { token: session.backendToken })
      .then(({ leads }) => setLeads(leads || []))
      .catch(() => {});
  }, [session?.backendToken, id]);

  useEffect(() => {
    loadCampaign();
    loadLeads();
  }, [loadCampaign, loadLeads]);

  // Sync skipped state from DB whenever leads reload
  useEffect(() => {
    setSkippedIds(new Set(leads.filter(l => l.status === "SKIPPED").map(l => l.id)));
  }, [leads]);

  async function onRun() {
    setError("");
    try {
      const { jobId } = await apiFetch(`/api/campaigns/${id}/run`, {
        token: session.backendToken, method: "POST"
      });
      setJobId(jobId);
    } catch (e) { setError(e.message); }
  }

  async function onAction(gate) {
    setActing(true);
    setError("");
    try {
      await apiFetch(`/api/campaigns/${id}/${gate}`, {
        token: session.backendToken, method: "POST"
      });
      loadCampaign();
      loadLeads();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  async function onSkip(leadId) {
    setRowError(prev => { const n = { ...prev }; delete n[leadId]; return n; });
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        token: session.backendToken, method: "PATCH", body: { status: "SKIPPED" }
      });
      setSkippedIds(prev => new Set([...prev, leadId]));
    } catch (e) {
      setRowError(prev => ({ ...prev, [leadId]: e.message }));
    }
  }

  async function onUndoSkip(leadId) {
    setRowError(prev => { const n = { ...prev }; delete n[leadId]; return n; });
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        token: session.backendToken, method: "PATCH", body: { status: "NEW" }
      });
      setSkippedIds(prev => { const next = new Set(prev); next.delete(leadId); return next; });
    } catch (e) {
      setRowError(prev => ({ ...prev, [leadId]: e.message }));
    }
  }

  function onApproveAll() {
    setSkippedIds(new Set());
  }

  async function onConfirmApproval() {
    setActing(true);
    setError("");
    try {
      const approvedIds = leads
        .filter(l => !skippedIds.has(l.id) && l.email)
        .map(l => l.id);
      await apiFetch(`/api/campaigns/${id}/approve-leads`, {
        token: session.backendToken, method: "POST", body: { approvedIds }
      });
      loadCampaign();
      loadLeads();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  async function onSyncStatus() {
    setActing(true);
    setError("");
    try {
      const { updated } = await apiFetch(`/api/campaigns/${id}/sync-lead-status`, {
        token: session.backendToken, method: "POST"
      });
      if (updated > 0) loadLeads();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  async function onSeedDevLead() {
    setActing(true);
    setError("");
    try {
      await apiFetch(`/api/campaigns/${id}/dev-seed-lead`, {
        token: session.backendToken, method: "POST"
      });
      loadLeads();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  if (!campaign) return <p>Loading...</p>;

  const isViewer = session?.user?.role === "VIEWER";
  const isApprovalMode = campaign.status === "AWAITING_LEAD_APPROVAL" && !isViewer;
  const leadsWithEmail = leads.filter(l => l.email);
  const approvedCount = leadsWithEmail.filter(l => !skippedIds.has(l.id)).length;

  return (
    <div className="space-y-4 pb-20">
      {campaign.mode === "TEST" && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs px-3 py-2 rounded flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wide">Test Campaign</span>
          <span>— emails use a fixed demo template. Regenerate will also produce demo content, not AI outreach.</span>
        </div>
      )}
      {DEV_MODE && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 text-xs px-3 py-1 rounded font-mono">
          DEV MODE — all outbound emails redirected to madnevedant15@gmail.com
        </div>
      )}

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

      {isApprovalMode && (
        <div className="border border-yellow-400 bg-yellow-50 rounded p-3">
          <p className="font-semibold text-yellow-800 text-sm">
            {campaign._count?.leads ?? 0} leads fetched — review scores below, skip any poor fits, then confirm.
          </p>
        </div>
      )}

      {campaign.status === "AWAITING_EMAIL_APPROVAL" && !isViewer && (
        <div className="border border-blue-400 bg-blue-50 rounded p-4 space-y-2">
          <p className="font-semibold text-blue-800">
            Emails generated — review drafts below then approve to launch or reject to reset.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onAction("approve-emails")}
              disabled={acting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Approve &amp; launch
            </button>
            <button
              onClick={() => onAction("reject-emails")}
              disabled={acting}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Reject — discard &amp; reset
            </button>
          </div>
        </div>
      )}

      {jobId && <JobProgressBar jobId={jobId} />}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <h2 className="font-semibold mb-1">Raw goal</h2>
        <p className="text-sm">{campaign.rawGoal}</p>
      </div>
      <div>
        <h2 className="font-semibold mb-1">Extracted filters</h2>
        <FilterPreview filters={campaign.extractedFilters} />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold">Leads ({leads.length})</h2>
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
        ) : isApprovalMode ? (
          <LeadApprovalTable
            leads={leads}
            skippedIds={skippedIds}
            onSkip={onSkip}
            onUndoSkip={onUndoSkip}
            rowError={rowError}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-1">Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className={`border-b hover:bg-gray-50 ${l.email === "madnevedant15@gmail.com" && DEV_MODE ? "bg-yellow-50" : ""}`}>
                  <td className="py-2">
                    <Link className="underline" href={`/leads/${l.id}`}>
                      {l.firstName} {l.lastName}
                      {l.email === "madnevedant15@gmail.com" && DEV_MODE && (
                        <span className="ml-1 text-xs text-yellow-700 font-mono">[DEV]</span>
                      )}
                    </Link>
                  </td>
                  <td>{l.title}</td>
                  <td>{l.company}</td>
                  <td>{l.email}</td>
                  <td>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sticky approval footer — only visible during AWAITING_LEAD_APPROVAL */}
      {isApprovalMode && (
        <div className="fixed bottom-0 left-48 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between shadow-lg z-10">
          <span className="text-sm text-gray-700">
            <span className="font-semibold">{approvedCount}</span> of {leadsWithEmail.length} leads approved
          </span>
          <div className="flex gap-2">
            <button
              onClick={onApproveAll}
              className="text-sm border border-gray-400 px-3 py-1.5 rounded text-gray-700 hover:bg-gray-50"
            >
              Approve All
            </button>
            <button
              onClick={onConfirmApproval}
              disabled={acting || approvedCount === 0}
              className="text-sm bg-green-600 text-white px-4 py-1.5 rounded disabled:opacity-50"
            >
              {acting ? "Confirming…" : "Confirm & Generate Emails"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the full backend test suite to confirm nothing regressed**

```bash
cd backend && npm test
```

Expected: All existing tests pass.

- [ ] **Step 3: Verify in the browser**

Make sure both servers are running (`npm run dev:backend` and `npm run dev:frontend`). Open `http://localhost:3000`, log in, and open a campaign in `AWAITING_LEAD_APPROVAL` status.

Check:
- The old "Approve — generate emails / Reject — discard & reset" buttons are gone
- Leads table now shows Score and Fit Reasoning columns
- Clicking Skip on a row greys it out and shows Undo
- The sticky footer at the bottom of the screen shows the correct approved count
- "Confirm & Generate Emails" is disabled when 0 leads are approved
- Clicking "Approve All" restores all rows and updates the counter

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/(app)/campaigns/[id]/page.jsx
git commit -m "feat(ui): per-lead approve/skip HITL gate with sticky footer and score display"
```

---

## Task 7: Final Test Run and Push

- [ ] **Step 1: Run the complete backend test suite**

```bash
cd backend && npm test
```

Expected: All tests pass.

- [ ] **Step 2: Push to remote**

```bash
git push origin main
```
