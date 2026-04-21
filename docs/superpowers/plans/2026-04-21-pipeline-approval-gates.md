# Pipeline Approval Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two yes/no approval gates to the campaign pipeline — one after leads are fetched, one after emails are generated — so the user must explicitly approve before each stage continues; rejecting either gate resets the campaign to DRAFT and deletes the data.

**Architecture:** Two new `CampaignStatus` values (`AWAITING_LEAD_APPROVAL`, `AWAITING_EMAIL_APPROVAL`) pause the pipeline at natural breakpoints. Workers set these statuses instead of auto-enqueuing the next job. Four new route handlers on `campaigns.js` handle approve/reject for each gate. The campaign detail page shows a status-driven approval banner.

**Tech Stack:** Prisma (PostgreSQL), Express, pg-boss, Next.js 15, React 19, next-auth

---

## File Map

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add 2 enum values to `CampaignStatus` |
| `backend/workers/fetchLeads.js` | Stop auto-enqueuing; set `AWAITING_LEAD_APPROVAL` instead |
| `backend/workers/generateEmail.js` | Stop auto-dispatching; set `AWAITING_EMAIL_APPROVAL` instead |
| `backend/routes/campaigns.js` | Add 4 routes: approve-leads, reject-leads, approve-emails, reject-emails |
| `backend/tests/workers/fetchLeads.test.js` | Update status assertion; add gate test |
| `backend/tests/workers/generateEmail.test.js` | Add gate test |
| `backend/tests/routes/campaigns.test.js` | Add tests for all 4 new routes |
| `frontend/src/app/(app)/campaigns/[id]/page.jsx` | Add approval banner component |

---

## Task 1: Schema — Add Two New Statuses

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Update the CampaignStatus enum**

Open `backend/prisma/schema.prisma`. Replace:

```prisma
enum CampaignStatus {
  DRAFT
  RUNNING
  PAUSED
  COMPLETED
}
```

With:

```prisma
enum CampaignStatus {
  DRAFT
  RUNNING
  AWAITING_LEAD_APPROVAL
  AWAITING_EMAIL_APPROVAL
  PAUSED
  COMPLETED
}
```

- [ ] **Step 2: Run the migration**

```bash
cd backend && npm run prisma:migrate
```

When prompted for a migration name, enter: `add_approval_gate_statuses`

Expected: migration applied successfully, no errors.

- [ ] **Step 3: Regenerate Prisma client**

```bash
npm run prisma:generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(schema): add AWAITING_LEAD_APPROVAL and AWAITING_EMAIL_APPROVAL statuses"
```

---

## Task 2: fetchLeads Worker — Gate 1

**Files:**
- Modify: `backend/workers/fetchLeads.js`
- Modify: `backend/tests/workers/fetchLeads.test.js`

- [ ] **Step 1: Write the failing test**

Open `backend/tests/workers/fetchLeads.test.js`. Replace the existing test `"stores fully enriched leads and enqueues generate-email for each"` with:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/workers/fetchLeads.test.js -t "AWAITING_LEAD_APPROVAL" --no-coverage
```

Expected: FAIL — `expect(received).toBe(expected)` — `"RUNNING"` vs `"AWAITING_LEAD_APPROVAL"`

- [ ] **Step 3: Update fetchLeads.js**

Open `backend/workers/fetchLeads.js`. Replace the bottom of `runFetchLeadsJob` — the block that enqueues `generate-email` jobs:

```js
  // Enqueue email generation for each lead with an email
  const boss = await getBoss();
  const leads = await prisma.lead.findMany({ where: { campaignId, email: { not: null } } });
  for (const lead of leads) {
    await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
  }
  return { leadCount: leads.length };
```

With:

```js
  const leads = await prisma.lead.findMany({ where: { campaignId, email: { not: null } } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "AWAITING_LEAD_APPROVAL" } });
  logger.info(`fetch-leads: campaign ${campaignId} awaiting lead approval (${leads.length} leads)`);
  return { leadCount: leads.length };
```

Also remove the `getBoss` import from this file if it's no longer used anywhere else. Check: `getBoss` was only used for the enqueue. Remove it:

```js
// Remove this import line:
import { getBoss } from "../lib/pgboss.js";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/workers/fetchLeads.test.js --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/workers/fetchLeads.js backend/tests/workers/fetchLeads.test.js
git commit -m "feat(worker): pause fetchLeads at AWAITING_LEAD_APPROVAL instead of auto-enqueuing"
```

---

## Task 3: generateEmail Worker — Gate 2

**Files:**
- Modify: `backend/workers/generateEmail.js`
- Modify: `backend/tests/workers/generateEmail.test.js`

- [ ] **Step 1: Write the failing test**

Open `backend/tests/workers/generateEmail.test.js`. Add this test inside the existing `describe` block:

```js
test("sets campaign to AWAITING_EMAIL_APPROVAL when last lead gets its email (autoDispatch)", async () => {
  const { user } = await createUser({ email: `gate${Date.now()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  // Create two leads, both with emails
  const lead1 = await prisma.lead.create({
    data: { firstName: "A", lastName: "B", email: "a@b.com", company: "Acme", campaignId: campaign.id }
  });
  const lead2 = await prisma.lead.create({
    data: { firstName: "C", lastName: "D", email: "c@d.com", company: "Beta", campaignId: campaign.id }
  });

  // Generate email for lead1 — still one pending, should NOT set approval status
  await runGenerateEmailJob({ data: { leadId: lead1.id, autoDispatch: true } });
  let updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
  expect(updated.status).toBe("DRAFT");

  // Generate email for lead2 — now zero pending, should set AWAITING_EMAIL_APPROVAL
  await runGenerateEmailJob({ data: { leadId: lead2.id, autoDispatch: true } });
  updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
  expect(updated.status).toBe("AWAITING_EMAIL_APPROVAL");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/workers/generateEmail.test.js -t "AWAITING_EMAIL_APPROVAL" --no-coverage
```

Expected: FAIL — status is `"DRAFT"` not `"AWAITING_EMAIL_APPROVAL"`

- [ ] **Step 3: Update generateEmail.js**

Open `backend/workers/generateEmail.js`. Replace the `if (autoDispatch)` block:

```js
  // Only auto-dispatch when triggered by the fetchLeads pipeline (not manual regeneration)
  if (autoDispatch) {
    const pendingLeads = await prisma.lead.count({
      where: {
        campaignId: lead.campaignId,
        email: { not: null },
        emails: { none: {} }
      }
    });
    if (pendingLeads === 0) {
      const campaign = await prisma.campaign.findUnique({ where: { id: lead.campaignId } });
      if (campaign && !campaign.instantlyCampaignId) {
        const boss = await getBoss();
        await boss.send("dispatch-to-instantly", { campaignId: lead.campaignId });
        logger.info(`enqueued dispatch for campaign ${lead.campaignId}`);
      }
    }
  }
```

With:

```js
  if (autoDispatch) {
    const pendingLeads = await prisma.lead.count({
      where: {
        campaignId: lead.campaignId,
        email: { not: null },
        emails: { none: {} }
      }
    });
    if (pendingLeads === 0) {
      await prisma.campaign.update({
        where: { id: lead.campaignId },
        data: { status: "AWAITING_EMAIL_APPROVAL" }
      });
      logger.info(`campaign ${lead.campaignId} awaiting email approval`);
    }
  }
```

Also remove the now-unused `getBoss` import from `generateEmail.js`:

```js
// Remove this line:
import { getBoss } from "../lib/pgboss.js";
```

- [ ] **Step 4: Run all generateEmail tests**

```bash
cd backend && npx jest tests/workers/generateEmail.test.js --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/workers/generateEmail.js backend/tests/workers/generateEmail.test.js
git commit -m "feat(worker): pause generateEmail at AWAITING_EMAIL_APPROVAL instead of auto-dispatching"
```

---

## Task 4: Four Approval Routes

**Files:**
- Modify: `backend/routes/campaigns.js`
- Modify: `backend/tests/routes/campaigns.test.js`

- [ ] **Step 1: Write the failing tests**

Open `backend/tests/routes/campaigns.test.js`. Add a new `describe` block after the existing tests:

```js
describe("approval gates", () => {
  async function makeCampaignWithStatus(token, status) {
    const { user } = await prisma.user.findFirst({ where: {} }).then(() => ({ user: null }));
    // Create campaign directly in DB at the given status
    const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const campaign = await prisma.campaign.create({
      data: { name: "Gate test", rawGoal: "test goal", extractedFilters: {}, status, createdById: decoded.sub }
    });
    return campaign;
  }

  test("POST /approve-leads enqueues generate-email and sets RUNNING", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `al${Date.now()}@x.com` });
    const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: decoded.sub }
    });
    await prisma.lead.createMany({
      data: [
        { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id },
        { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id }
      ]
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("POST /approve-leads returns 409 if campaign not in AWAITING_LEAD_APPROVAL", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `al2${Date.now()}@x.com` });
    const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "DRAFT", createdById: decoded.sub }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(409);
  });

  test("POST /reject-leads deletes leads and sets DRAFT", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `rl${Date.now()}@x.com` });
    const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: decoded.sub }
    });
    await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/reject-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(0);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("DRAFT");
  });

  test("POST /approve-emails enqueues dispatch and sets RUNNING", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `ae${Date.now()}@x.com` });
    const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_EMAIL_APPROVAL", createdById: decoded.sub }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-emails`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("POST /reject-emails deletes leads + emails and sets DRAFT", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `re${Date.now()}@x.com` });
    const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_EMAIL_APPROVAL", createdById: decoded.sub }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id }
    });
    await prisma.email.create({
      data: { leadId: lead.id, subject: "Hi", body: "Body", version: 1, status: "DRAFT" }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/reject-emails`)
      .set(authHeader(token));

    expect(res.status).toBe(200);

    const emails = await prisma.email.findMany({ where: { leadId: lead.id } });
    expect(emails).toHaveLength(0);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(0);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("DRAFT");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest tests/routes/campaigns.test.js -t "approval gates" --no-coverage
```

Expected: 5 tests FAIL with 404 (routes don't exist yet)

- [ ] **Step 3: Add the four routes to campaigns.js**

Open `backend/routes/campaigns.js`. Add these four routes before the final `export default router;` line:

```js
router.post("/:id/approve-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id, email: { not: null } } });
    const boss = await getBoss();
    for (const lead of leads) {
      await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
    }
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/reject-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    await prisma.lead.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/approve-emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_EMAIL_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    const boss = await getBoss();
    await boss.send("dispatch-to-instantly", { campaignId: campaign.id });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/reject-emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_EMAIL_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
    const leadIds = leads.map(l => l.id);
    await prisma.email.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run all campaigns route tests**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/campaigns.js backend/tests/routes/campaigns.test.js
git commit -m "feat(routes): add approve/reject routes for lead and email approval gates"
```

---

## Task 5: Frontend Approval Banner

**Files:**
- Modify: `frontend/src/app/(app)/campaigns/[id]/page.jsx`

- [ ] **Step 1: Update the campaign detail page**

Replace the full content of `frontend/src/app/(app)/campaigns/[id]/page.jsx` with:

```jsx
"use client";
import { use, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import FilterPreview from "@/components/FilterPreview";
import JobProgressBar from "@/components/JobProgressBar";

export default function CampaignDetailPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  function loadCampaign() {
    if (!session?.backendToken) return;
    apiFetch(`/api/campaigns/${id}`, { token: session.backendToken })
      .then(({ campaign }) => setCampaign(campaign));
  }

  useEffect(() => { loadCampaign(); }, [session?.backendToken, id]);

  async function onRun() {
    setError("");
    try {
      const { jobId } = await apiFetch(`/api/campaigns/${id}/run`, {
        token: session.backendToken, method: "POST"
      });
      setJobId(jobId);
    } catch (e) { setError(e.message); }
  }

  async function onApprove(gate) {
    setActing(true);
    setError("");
    try {
      await apiFetch(`/api/campaigns/${id}/${gate}`, {
        token: session.backendToken, method: "POST"
      });
      loadCampaign();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  async function onReject(gate) {
    setActing(true);
    setError("");
    try {
      await apiFetch(`/api/campaigns/${id}/${gate}`, {
        token: session.backendToken, method: "POST"
      });
      loadCampaign();
    } catch (e) { setError(e.message); }
    finally { setActing(false); }
  }

  if (!campaign) return <p>Loading...</p>;

  const isViewer = session?.user?.role === "VIEWER";

  return (
    <div className="space-y-4">
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

      {campaign.status === "AWAITING_LEAD_APPROVAL" && !isViewer && (
        <div className="border border-yellow-400 bg-yellow-50 rounded p-4 space-y-2">
          <p className="font-semibold text-yellow-800">
            {campaign._count?.leads ?? 0} leads fetched — review below then approve or reject.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onApprove("approve-leads")}
              disabled={acting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Approve — generate emails
            </button>
            <button
              onClick={() => onReject("reject-leads")}
              disabled={acting}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Reject — discard &amp; reset
            </button>
          </div>
        </div>
      )}

      {campaign.status === "AWAITING_EMAIL_APPROVAL" && !isViewer && (
        <div className="border border-blue-400 bg-blue-50 rounded p-4 space-y-2">
          <p className="font-semibold text-blue-800">
            Emails generated — review drafts below then approve to launch or reject to reset.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onApprove("approve-emails")}
              disabled={acting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              Approve &amp; launch
            </button>
            <button
              onClick={() => onReject("reject-emails")}
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
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript/JSX errors (warnings about unused vars are OK)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(app\)/campaigns/\[id\]/page.jsx
git commit -m "feat(frontend): add approval gate banners to campaign detail page"
```

---

## Task 6: Full Test Suite

- [ ] **Step 1: Run the complete backend test suite**

```bash
cd backend && npm test 2>&1 | tail -30
```

Expected: all test suites pass. Zero failures.

- [ ] **Step 2: If any test fails, read the failure output and fix before proceeding**

Common failure: existing test in `fetchLeads.test.js` may still reference `"RUNNING"` as the post-fetch status. If so, update it to `"AWAITING_LEAD_APPROVAL"`.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(tests): align assertions with new approval gate statuses"
```
