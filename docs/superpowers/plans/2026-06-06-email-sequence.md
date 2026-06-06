# Email Sequence — Generate, Edit, Approve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users generate a multi-step cold email sequence from the campaign brief + brand doc, review it, edit inline or via a natural-language prompt, and approve it — all inside the campaign detail page.

**Architecture:** A new `SequenceStep` DB model holds per-step copy (subject, body, delayDays). Five new REST endpoints under `/api/campaigns/:id/sequence` handle generate, save, revise (AI), and approve. A new `EmailSequencePanel` frontend component replaces the existing single-template panel for this workflow — the old `EmailTemplatePanel` stays in place untouched.

**Tech Stack:** Prisma (PostgreSQL), Express, Zod, Groq via `services/gemini.js`, React 19, Next.js 15, Tailwind 4.

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/prisma/schema.prisma` |
| Create | `backend/prisma/migrations/YYYYMMDD_add_sequence_steps/migration.sql` |
| Modify | `backend/services/emailGen.js` |
| Create | `backend/routes/sequence.js` |
| Modify | `backend/app.js` |
| Create | `backend/tests/routes/sequence.test.js` |
| Create | `frontend/src/components/EmailSequencePanel.jsx` |
| Modify | `frontend/src/app/(app)/campaigns/[id]/page.jsx` |

---

## Task 1: DB Schema — SequenceStep Model

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_sequence_steps/migration.sql`

- [ ] **Step 1: Add SequenceStep model and Campaign.sequenceApproved to schema.prisma**

In `backend/prisma/schema.prisma`, add to the `Campaign` model (after `senderEmail`):

```prisma
  sequenceApproved     Boolean         @default(false)
  sequenceSteps        SequenceStep[]
```

Then add the new model at the end of the file:

```prisma
model SequenceStep {
  id         String   @id @default(cuid())
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  campaignId String
  stepNumber Int
  subject    String
  body       String
  delayDays  Int      @default(0)
  createdAt  DateTime @default(now())

  @@unique([campaignId, stepNumber])
}
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npm run prisma:migrate
# When prompted for a name, enter: add_sequence_steps
```

Expected: Migration file created and applied, `prisma generate` runs automatically.

- [ ] **Step 3: Verify schema compiles**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at ... is valid!`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add SequenceStep model and Campaign.sequenceApproved"
```

---

## Task 2: emailGen Service — generateSequence + reviseSequence

**Files:**
- Modify: `backend/services/emailGen.js`

- [ ] **Step 1: Write failing tests first**

Create `backend/tests/services/emailGen.sequence.test.js`:

```js
import { jest } from "@jest/globals";
import { generateSequence, reviseSequence } from "../../services/emailGen.js";

const fakeGenerate = jest.fn();

describe("generateSequence", () => {
  test("returns parsed steps array from AI", async () => {
    fakeGenerate.mockResolvedValueOnce([
      { stepNumber: 1, delayDays: 0, subject: "Hi {{firstName}}", body: "Step 1 body." },
      { stepNumber: 2, delayDays: 3, subject: "Following up", body: "Step 2 body." }
    ]);
    const result = await generateSequence("Find CTOs in India", null, { generate: fakeGenerate });
    expect(result).toHaveLength(2);
    expect(result[0].stepNumber).toBe(1);
    expect(result[0].delayDays).toBe(0);
    expect(result[1].delayDays).toBe(3);
  });

  test("injects brand guidelines when provided", async () => {
    fakeGenerate.mockResolvedValueOnce([
      { stepNumber: 1, delayDays: 0, subject: "Sub", body: "Body" }
    ]);
    const brandFields = { tone: "professional", campaignGoals: "book calls", targetPersonas: null, proofPoints: null, bannedWords: null };
    await generateSequence("goal", brandFields, { generate: fakeGenerate });
    const calledPrompt = fakeGenerate.mock.calls[0][0];
    expect(calledPrompt).toContain("professional");
  });
});

describe("reviseSequence", () => {
  test("passes current steps and user prompt to AI and returns revised steps", async () => {
    const currentSteps = [
      { stepNumber: 1, delayDays: 0, subject: "Old subject", body: "Old body." }
    ];
    fakeGenerate.mockResolvedValueOnce([
      { stepNumber: 1, delayDays: 0, subject: "Shorter subject", body: "Short." }
    ]);
    const result = await reviseSequence(currentSteps, "make step 1 shorter", null, { generate: fakeGenerate });
    expect(result[0].subject).toBe("Shorter subject");
    const calledPrompt = fakeGenerate.mock.calls[0][0];
    expect(calledPrompt).toContain("make step 1 shorter");
    expect(calledPrompt).toContain("Old subject");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/services/emailGen.sequence.test.js
```

Expected: FAIL — `generateSequence is not a function`

- [ ] **Step 3: Implement generateSequence and reviseSequence in emailGen.js**

Append to `backend/services/emailGen.js`:

```js
const SEQUENCE_SYSTEM = `You are a world-class outbound copywriter. Create a cold B2B email sequence.

Return ONLY a JSON array of 2-4 steps, no preamble or wrapper object:
[
  { "stepNumber": 1, "delayDays": 0, "subject": "...", "body": "..." },
  { "stepNumber": 2, "delayDays": 3, "subject": "...", "body": "..." }
]

Rules:
- 2-4 steps total
- Step 1: delayDays MUST be 0 (sent immediately)
- Subsequent steps: delayDays = days after previous step (3-7 typical)
- Subject ≤ 60 chars
- Body ≤ 150 words each
- Plain text only — no markdown, no em-dashes
- Placeholders: {{firstName}}, {{company}}, {{title}}, {{aiPersonalization}}
- Step 1 = warm intro; step 2 = gentle follow-up; final step = brief close`;

export async function generateSequence(rawGoal, brandFields = null, { generate = generateJson } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${SEQUENCE_SYSTEM}\n\nCampaign goal: ${rawGoal}\n\nJSON array:`;
  return generate(prompt, opts);
}

const REVISE_SYSTEM = `You are a world-class outbound copywriter. Revise an email sequence based on user feedback.

Return ONLY the full revised sequence as a JSON array in the same format. Keep unchanged steps exactly as-is.`;

export async function reviseSequence(currentSteps, userPrompt, brandFields = null, { generate = generateJson } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${REVISE_SYSTEM}

Current sequence:
${JSON.stringify(currentSteps, null, 2)}

User request: ${userPrompt}

JSON array:`;
  return generate(prompt, opts);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/services/emailGen.sequence.test.js
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add backend/services/emailGen.js backend/tests/services/emailGen.sequence.test.js
git commit -m "feat(emailGen): add generateSequence and reviseSequence"
```

---

## Task 3: Backend Sequence Routes

**Files:**
- Create: `backend/routes/sequence.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Create backend/routes/sequence.js**

```js
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { prisma } from "../lib/prisma.js";
import {
  generateSequence as realGenerateSequence,
  reviseSequence as realReviseSequence,
} from "../services/emailGen.js";

const router = Router();
router.use(requireAuth);

let generateSequenceFn = realGenerateSequence;
let reviseSequenceFn = realReviseSequence;
export function __setGenerateSequenceImpl(fn) { generateSequenceFn = fn; }
export function __setReviseSequenceImpl(fn) { reviseSequenceFn = fn; }

const stepSchema = z.object({
  stepNumber: z.number().int().positive(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  delayDays: z.number().int().min(0),
});
const saveSchema = z.object({ steps: z.array(stepSchema).min(1).max(10) });
const reviseSchema = z.object({ prompt: z.string().min(1).max(1000) });

async function getCampaignOrFail(id, res) {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) { res.status(404).json({ error: "not_found" }); return null; }
  return campaign;
}

async function replaceSteps(campaignId, steps) {
  await prisma.$transaction([
    prisma.sequenceStep.deleteMany({ where: { campaignId } }),
    prisma.sequenceStep.createMany({
      data: steps.map(s => ({
        campaignId,
        stepNumber: s.stepNumber,
        subject: s.subject,
        body: s.body,
        delayDays: s.delayDays,
      })),
    }),
  ]);
  return prisma.sequenceStep.findMany({
    where: { campaignId },
    orderBy: { stepNumber: "asc" },
  });
}

// GET /api/campaigns/:id/sequence
router.get("/:id/sequence", async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const steps = await prisma.sequenceStep.findMany({
      where: { campaignId: campaign.id },
      orderBy: { stepNumber: "asc" },
    });
    res.json({ steps, sequenceApproved: campaign.sequenceApproved });
  } catch (e) { next(e); }
});

// POST /api/campaigns/:id/sequence/generate
router.post("/:id/sequence/generate", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const raw = await generateSequenceFn(campaign.rawGoal, brandFields);
    const steps = await replaceSteps(campaign.id, raw);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { sequenceApproved: false } });
    res.json({ steps });
  } catch (e) { next(e); }
});

// PUT /api/campaigns/:id/sequence  (save inline edits)
router.put("/:id/sequence", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input", issues: parsed.error.issues });
    const steps = await replaceSteps(campaign.id, parsed.data.steps);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { sequenceApproved: false } });
    res.json({ steps });
  } catch (e) { next(e); }
});

// POST /api/campaigns/:id/sequence/revise
router.post("/:id/sequence/revise", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const parsed = reviseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input", issues: parsed.error.issues });
    const current = await prisma.sequenceStep.findMany({
      where: { campaignId: campaign.id },
      orderBy: { stepNumber: "asc" },
    });
    if (current.length === 0) return res.status(400).json({ error: "no_sequence", message: "Generate a sequence first." });
    const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const raw = await reviseSequenceFn(current, parsed.data.prompt, brandFields);
    const steps = await replaceSteps(campaign.id, raw);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { sequenceApproved: false } });
    res.json({ steps });
  } catch (e) { next(e); }
});

// POST /api/campaigns/:id/sequence/approve
router.post("/:id/sequence/approve", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const count = await prisma.sequenceStep.count({ where: { campaignId: campaign.id } });
    if (count === 0) return res.status(400).json({ error: "no_sequence", message: "Generate a sequence before approving." });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { sequenceApproved: true } });
    res.json({ sequenceApproved: true });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 2: Register the router in app.js**

In `backend/app.js`, add the import after the other route imports:

```js
import sequenceRouter from "./routes/sequence.js";
```

Add the mount inside `createApp()`, before the 404 handler:

```js
app.use("/api/campaigns", sequenceRouter);
```

Place it **after** the existing `app.use("/api/campaigns", campaignsRouter)` line.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/sequence.js backend/app.js
git commit -m "feat(sequence): add sequence routes (generate, save, revise, approve)"
```

---

## Task 4: Backend Tests for Sequence Routes

**Files:**
- Create: `backend/tests/routes/sequence.test.js`

- [ ] **Step 1: Write the tests**

Create `backend/tests/routes/sequence.test.js`:

```js
import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { stopBoss } from "../../lib/pgboss.js";
import { __setExtractFilters } from "../../routes/campaigns.js";
import { __setGenerateSequenceImpl, __setReviseSequenceImpl } from "../../routes/sequence.js";

const app = createApp();
const FAKE_STEPS = [
  { stepNumber: 1, delayDays: 0, subject: "Hi {{firstName}}", body: "Step 1 body here." },
  { stepNumber: 2, delayDays: 3, subject: "Following up", body: "Step 2 follow-up body." },
];

beforeEach(async () => {
  await resetDb();
  __setExtractFilters(async () => ({ filters: {}, confidence: 0.9, needsClarification: false }));
  __setGenerateSequenceImpl(async () => FAKE_STEPS);
  __setReviseSequenceImpl(async () => FAKE_STEPS.map(s => ({ ...s, subject: "Revised " + s.subject })));
});
afterAll(async () => { await stopBoss(); });

async function makeManager() {
  return createUser({ role: "MANAGER" });
}

async function makeCampaign(token) {
  const res = await request(app)
    .post("/api/campaigns")
    .set(authHeader(token))
    .send({ name: "Seq Test", rawGoal: "Find CTOs in India", mode: "TEST", testEmails: ["a@b.com"] });
  return res.body.campaign.id;
}

describe("GET /api/campaigns/:id/sequence", () => {
  test("returns empty steps and sequenceApproved=false for new campaign", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app).get(`/api/campaigns/${id}/sequence`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.steps).toEqual([]);
    expect(res.body.sequenceApproved).toBe(false);
  });

  test("401 without token", async () => {
    const res = await request(app).get("/api/campaigns/fake/sequence");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/campaigns/:id/sequence/generate", () => {
  test("generates and saves steps, returns them", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/generate`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.steps[0].stepNumber).toBe(1);
    expect(res.body.steps[0].delayDays).toBe(0);
    expect(res.body.steps[1].delayDays).toBe(3);
  });

  test("resets sequenceApproved to false on regenerate", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    await request(app).post(`/api/campaigns/${id}/sequence/approve`).set(authHeader(token));
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const check = await request(app).get(`/api/campaigns/${id}/sequence`).set(authHeader(token));
    expect(check.body.sequenceApproved).toBe(false);
  });

  test("403 for VIEWER", async () => {
    const { token: mgr } = await makeManager();
    const id = await makeCampaign(mgr);
    const { token: viewer } = await createUser({ role: "VIEWER", email: "v@x.com" });
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/generate`)
      .set(authHeader(viewer));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/campaigns/:id/sequence", () => {
  test("saves edited steps and resets approval", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const edited = [
      { stepNumber: 1, delayDays: 0, subject: "Edited subject", body: "Edited body." },
      { stepNumber: 2, delayDays: 5, subject: "Edited follow-up", body: "Edited follow-up body." },
    ];
    const res = await request(app)
      .put(`/api/campaigns/${id}/sequence`)
      .set(authHeader(token))
      .send({ steps: edited });
    expect(res.status).toBe(200);
    expect(res.body.steps[0].subject).toBe("Edited subject");
    expect(res.body.steps[1].delayDays).toBe(5);
  });

  test("400 on invalid input (missing stepNumber)", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .put(`/api/campaigns/${id}/sequence`)
      .set(authHeader(token))
      .send({ steps: [{ subject: "x", body: "y", delayDays: 0 }] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/campaigns/:id/sequence/revise", () => {
  test("revises steps via AI and returns updated steps", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/revise`)
      .set(authHeader(token))
      .send({ prompt: "make step 1 shorter" });
    expect(res.status).toBe(200);
    expect(res.body.steps[0].subject).toMatch(/^Revised /);
  });

  test("400 when no sequence exists yet", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/revise`)
      .set(authHeader(token))
      .send({ prompt: "make it shorter" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_sequence");
  });
});

describe("POST /api/campaigns/:id/sequence/approve", () => {
  test("sets sequenceApproved true", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    await request(app).post(`/api/campaigns/${id}/sequence/generate`).set(authHeader(token));
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/approve`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.sequenceApproved).toBe(true);
    const check = await request(app).get(`/api/campaigns/${id}/sequence`).set(authHeader(token));
    expect(check.body.sequenceApproved).toBe(true);
  });

  test("400 when approving a campaign with no steps", async () => {
    const { token } = await makeManager();
    const id = await makeCampaign(token);
    const res = await request(app)
      .post(`/api/campaigns/${id}/sequence/approve`)
      .set(authHeader(token));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_sequence");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test tests/routes/sequence.test.js
```

Expected: All 10 tests pass.

- [ ] **Step 3: Run full suite to check for regressions**

```bash
npm test
```

Expected: All tests pass (205+ total).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/routes/sequence.test.js
git commit -m "test(sequence): full route coverage for generate, save, revise, approve"
```

---

## Task 5: Frontend EmailSequencePanel Component

**Files:**
- Create: `frontend/src/components/EmailSequencePanel.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/EmailSequencePanel.jsx`:

```jsx
"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function EmailSequencePanel({ campaignId, token }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState([]);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);
  const [revisePrompt, setRevisePrompt] = useState("");
  const [error, setError] = useState("");
  const [savedSteps, setSavedSteps] = useState([]);

  useEffect(() => {
    if (!open || !token) return;
    apiFetch(`/api/campaigns/${campaignId}/sequence`, { token })
      .then(({ steps: s, sequenceApproved }) => {
        setSteps(s);
        setSavedSteps(s);
        setApproved(sequenceApproved);
      })
      .catch(() => {});
  }, [open, campaignId, token]);

  const dirty = JSON.stringify(steps) !== JSON.stringify(savedSteps);

  function updateStep(idx, field, value) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const { steps: s } = await apiFetch(`/api/campaigns/${campaignId}/sequence/generate`, {
        token, method: "POST"
      });
      setSteps(s);
      setSavedSteps(s);
      setApproved(false);
    } catch (e) {
      setError(e.data?.message || e.message || "Generation failed — try again.");
    } finally { setLoading(false); }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const { steps: s } = await apiFetch(`/api/campaigns/${campaignId}/sequence`, {
        token, method: "PUT",
        body: { steps }
      });
      setSteps(s);
      setSavedSteps(s);
      setApproved(false);
    } catch (e) {
      setError(e.data?.message || e.message || "Save failed.");
    } finally { setSaving(false); }
  }

  async function handleRevise() {
    if (!revisePrompt.trim()) return;
    setRevising(true);
    setError("");
    try {
      const { steps: s } = await apiFetch(`/api/campaigns/${campaignId}/sequence/revise`, {
        token, method: "POST",
        body: { prompt: revisePrompt }
      });
      setSteps(s);
      setSavedSteps(s);
      setApproved(false);
      setRevisePrompt("");
    } catch (e) {
      setError(e.data?.message || e.message || "Revision failed — try again.");
    } finally { setRevising(false); }
  }

  async function handleApprove() {
    setError("");
    try {
      await apiFetch(`/api/campaigns/${campaignId}/sequence/approve`, { token, method: "POST" });
      setApproved(true);
    } catch (e) {
      setError(e.data?.message || e.message || "Approve failed.");
    }
  }

  const approvedBadge = approved
    ? <span className="text-xs bg-green-100 text-green-700 border border-green-300 px-2 py-0.5 rounded-full font-semibold">Approved</span>
    : steps.length > 0
      ? <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full">Pending review</span>
      : null;

  return (
    <div className="border border-gray-200 rounded">
      <button
        className="w-full flex justify-between items-center px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-left rounded"
        onClick={() => setOpen(v => !v)}
      >
        <span>Email Sequence</span>
        <div className="flex items-center gap-2">
          {approvedBadge}
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}

          {/* Generate button */}
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">
              {steps.length === 0
                ? "No sequence yet. Generate one from your campaign goal and brand doc."
                : `${steps.length}-step sequence`}
            </p>
            <button
              onClick={handleGenerate}
              disabled={loading || saving || revising}
              className="text-xs bg-black text-white px-3 py-1.5 rounded disabled:opacity-40"
            >
              {loading ? "Generating…" : steps.length === 0 ? "Generate sequence" : "Regenerate"}
            </button>
          </div>

          {/* Step cards */}
          {steps.map((step, idx) => (
            <div key={step.stepNumber} className="border border-gray-200 rounded p-3 space-y-2 bg-white">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Step {step.stepNumber}
                </span>
                <span className="text-xs text-gray-400">
                  {step.delayDays === 0 ? "Sent immediately" : `+${step.delayDays} days after previous`}
                </span>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Subject</label>
                <input
                  value={step.subject}
                  onChange={e => updateStep(idx, "subject", e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Body</label>
                <textarea
                  value={step.body}
                  onChange={e => updateStep(idx, "body", e.target.value)}
                  rows={5}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-gray-500 resize-y"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Delay (days after previous step)</label>
                <input
                  type="number"
                  min={0}
                  value={step.delayDays}
                  onChange={e => updateStep(idx, "delayDays", parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-24 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
            </div>
          ))}

          {/* Save inline edits */}
          {dirty && steps.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || revising}
                className="text-sm bg-gray-800 text-white px-4 py-1.5 rounded disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}

          {/* Revise with AI */}
          {steps.length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-700">Revise with AI</p>
              <p className="text-xs text-gray-400">
                e.g. "make step 1 shorter", "add more urgency to step 2", "remove the Sarvam reference in step 3"
              </p>
              <div className="flex gap-2">
                <input
                  value={revisePrompt}
                  onChange={e => setRevisePrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRevise(); } }}
                  placeholder="Describe your change…"
                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                />
                <button
                  onClick={handleRevise}
                  disabled={revising || loading || !revisePrompt.trim()}
                  className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded disabled:opacity-40"
                >
                  {revising ? "Revising…" : "Revise"}
                </button>
              </div>
            </div>
          )}

          {/* Approve */}
          {steps.length > 0 && !dirty && (
            <div className="flex justify-end items-center gap-3 border-t border-gray-100 pt-3">
              {approved && (
                <span className="text-xs text-green-600 font-medium">Sequence approved ✓</span>
              )}
              {!approved && (
                <button
                  onClick={handleApprove}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded"
                >
                  Approve sequence
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/EmailSequencePanel.jsx
git commit -m "feat(ui): add EmailSequencePanel with generate, inline edit, revise, approve"
```

---

## Task 6: Wire Panel into Campaign Detail Page

**Files:**
- Modify: `frontend/src/app/(app)/campaigns/[id]/page.jsx`

- [ ] **Step 1: Import and render EmailSequencePanel**

In `frontend/src/app/(app)/campaigns/[id]/page.jsx`, add the import after the existing component imports:

```js
import EmailSequencePanel from "@/components/EmailSequencePanel";
```

Find the existing `EmailTemplatePanel` block:

```jsx
{!isViewer && (
  <EmailTemplatePanel
    campaignId={id}
    token={session?.backendToken}
  />
)}
```

Add the `EmailSequencePanel` directly below it:

```jsx
{!isViewer && (
  <EmailSequencePanel
    campaignId={id}
    token={session?.backendToken}
  />
)}
```

- [ ] **Step 2: Start the dev server and test the full flow manually**

```bash
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

Open `http://localhost:3000`, navigate to any campaign detail page.

Manual test checklist:
- [ ] "Email Sequence" collapsible panel is visible below "Email Template"
- [ ] Clicking "Generate sequence" creates 2-4 steps and shows them
- [ ] Each step shows subject input, body textarea, delay input
- [ ] Editing a field shows "Save changes" button; clicking saves and removes the button
- [ ] Typing a prompt and clicking "Revise" updates the steps via AI
- [ ] "Approve sequence" button appears when steps are saved and unchanged; clicking shows "Sequence approved ✓" and the green Approved badge in the header
- [ ] Regenerating clears the approval badge back to "Pending review"

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(app\)/campaigns/\[id\]/page.jsx
git commit -m "feat(campaigns): add EmailSequencePanel to campaign detail page"
```

---

## Self-Review

**Spec coverage:**
- ✅ Bot generates full sequence (subjects, body, steps, delays) from brief + brand doc
- ✅ User reads all steps
- ✅ Edit inline (subject input, body textarea, delay input per step)
- ✅ Edit via AI prompt ("make step 1 shorter", "remove the Sarvam line in step 3")
- ✅ Approve (sets sequenceApproved flag, shows green badge)
- ✅ Ask once upfront: generate → show → user decides (no mid-run prompting)

**Type consistency check:**
- `generateSequence(rawGoal, brandFields, { generate })` → used in route as `generateSequenceFn(campaign.rawGoal, brandFields)`  ✅
- `reviseSequence(currentSteps, userPrompt, brandFields, { generate })` → used in route as `reviseSequenceFn(current, parsed.data.prompt, brandFields)` ✅
- `replaceSteps(campaignId, steps)` → called in generate, PUT, and revise routes ✅
- `__setGenerateSequenceImpl` / `__setReviseSequenceImpl` → exported from routes, imported in tests ✅

**Placeholder scan:** No TBDs, no "handle edge cases", all code blocks complete ✅
