# AI Generate Template Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Generate with AI" button to the Email Template Edit tab that calls Gemini using the campaign's `rawGoal` to produce a `{{variable}}`-placeholder template pre-filled into the Subject and Body fields.

**Architecture:** New `generateTemplateEmail(rawGoal, brandDoc)` function in `emailGen.js` drives a new `POST /api/campaigns/:id/template/generate` route in `campaigns.js`. The frontend calls that endpoint and populates the Edit tab fields; saving still goes through the existing PUT endpoint.

**Tech Stack:** Node/Express (backend), Gemini via `generateJson`, React/Next.js (frontend), Jest (backend tests), Vitest (frontend tests not required for this feature — no logic to unit-test in isolation).

---

## File Map

| File | Change |
|---|---|
| `backend/services/emailGen.js` | Add `generateTemplateEmail` export |
| `backend/routes/campaigns.js` | Add `POST /:id/template/generate` route + `__setGenerateTemplateEmailImpl` injection |
| `backend/tests/services/emailGen.test.js` | Add `generateTemplateEmail` unit tests |
| `backend/tests/routes/campaigns.test.js` | Add route integration tests inside existing `"template routes"` describe block |
| `frontend/src/components/EmailTemplatePanel.jsx` | Add `generating` state, `handleGenerate` function, "Generate with AI" button |

---

### Task 1: Add `generateTemplateEmail` to `emailGen.js`

**Files:**
- Modify: `backend/services/emailGen.js`
- Test: `backend/tests/services/emailGen.test.js`

- [ ] **Step 1: Write the failing tests**

Open `backend/tests/services/emailGen.test.js` and add these two tests after the existing ones:

```js
import { jest } from "@jest/globals";
import { generateDraft, generateTemplateEmail } from "../../services/emailGen.js";

// ... existing tests unchanged ...

describe("generateTemplateEmail", () => {
  test("returns subject and body using rawGoal", async () => {
    const fake = jest.fn().mockResolvedValue({
      subject: "Scale hiring at {{company}}",
      body: "Hi {{firstName}},\n\nAs {{title}} at {{company}}, you know hiring is hard..."
    });
    const result = await generateTemplateEmail("hire engineers fast", null, { generate: fake });
    expect(result.subject).toBeDefined();
    expect(result.body).toBeDefined();
    expect(fake).toHaveBeenCalledTimes(1);
    const [prompt] = fake.mock.calls[0];
    expect(prompt).toContain("hire engineers fast");
    expect(prompt).toContain("{{firstName}}");
    expect(prompt).toContain("{{company}}");
  });

  test("passes systemInstruction when brandDoc is provided", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (_prompt, opts) => {
      capturedOpts = opts;
      return { subject: "S", body: "B" };
    });
    await generateTemplateEmail("find CTOs", "Never say innovative.", { generate: fake });
    expect(capturedOpts).toHaveProperty("systemInstruction");
    expect(capturedOpts.systemInstruction).toContain("Never say innovative.");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/vedantmadne/Desktop/b2b_sales/backend
npx jest tests/services/emailGen.test.js --no-coverage
```

Expected: FAIL — `generateTemplateEmail is not a function` (or similar import error).

- [ ] **Step 3: Implement `generateTemplateEmail` in `emailGen.js`**

Add the following to `backend/services/emailGen.js` (after the existing `generateDraft` export):

```js
const TEMPLATE_SYSTEM = `You are a world-class outbound copywriter. Write a cold outreach B2B email template.

Use these exact placeholder tokens wherever lead-specific values belong:
- {{firstName}} — lead's first name
- {{lastName}} — lead's last name
- {{title}} — lead's job title
- {{company}} — lead's company name
- {{aiPersonalization}} — AI-generated hook line specific to the lead (use once in the opening if it helps)

Structure:
- Hook: use {{aiPersonalization}} or reference {{title}} / {{company}} plausibly
- Bridge: tie into the value proposition from the campaign goal
- Proof: 1 concrete credibility line
- CTA: one clear ask (15-min call)

Rules:
- Subject under 60 chars
- Body under 150 words
- Plain text, no markdown
- No em-dashes
- Use only the placeholder tokens listed above — no hardcoded names or companies

Return JSON: { "subject": string, "body": string }`;

export async function generateTemplateEmail(rawGoal, brandDoc = null, { generate = generateJson } = {}) {
  const opts = brandDoc ? { systemInstruction: `BRAND GUIDELINES — follow these for every output:\n${brandDoc}` } : {};
  const prompt = `${TEMPLATE_SYSTEM}

Campaign goal: ${rawGoal}

JSON:`;
  return generate(prompt, opts);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/vedantmadne/Desktop/b2b_sales/backend
npx jest tests/services/emailGen.test.js --no-coverage
```

Expected: all tests PASS (2 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add backend/services/emailGen.js backend/tests/services/emailGen.test.js
git commit -m "feat(emailGen): add generateTemplateEmail for campaign-goal-based template drafts"
```

---

### Task 2: Add `POST /:id/template/generate` route

**Files:**
- Modify: `backend/routes/campaigns.js`
- Test: `backend/tests/routes/campaigns.test.js`

- [ ] **Step 1: Write the failing route tests**

Find the `"template routes"` describe block in `backend/tests/routes/campaigns.test.js` (currently ends around line 556). Add these tests inside that block, after the existing template route tests:

```js
    test("POST /:id/template/generate returns subject and body", async () => {
      const { token } = await createUser({ email: `tgen1${Date.now()}@x.com`, role: "MANAGER" });
      const id = await makeCampaign(token);
      __setGenerateTemplateEmailImpl(jest.fn().mockResolvedValue({
        subject: "Scale hiring at {{company}}",
        body: "Hi {{firstName}}, I saw you're {{title}} at {{company}}..."
      }));
      const res = await request(app)
        .post(`/api/campaigns/${id}/template/generate`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        subject: "Scale hiring at {{company}}",
        body: expect.stringContaining("{{firstName}}")
      });
    });

    test("POST /:id/template/generate returns 404 for unknown campaign", async () => {
      const { token } = await createUser({ email: `tgen2${Date.now()}@x.com`, role: "MANAGER" });
      __setGenerateTemplateEmailImpl(jest.fn().mockResolvedValue({ subject: "S", body: "B" }));
      const res = await request(app)
        .post("/api/campaigns/nonexistent-id/template/generate")
        .set(authHeader(token));
      expect(res.status).toBe(404);
    });

    test("POST /:id/template/generate returns 403 for VIEWER", async () => {
      const { token: managerToken } = await createUser({ email: `tgen3m${Date.now()}@x.com`, role: "MANAGER" });
      const { token: viewerToken } = await createUser({ email: `tgen3v${Date.now()}@x.com`, role: "VIEWER" });
      const id = await makeCampaign(managerToken);
      const res = await request(app)
        .post(`/api/campaigns/${id}/template/generate`)
        .set(authHeader(viewerToken));
      expect(res.status).toBe(403);
    });
```

Also add `__setGenerateTemplateEmailImpl` to the import at the top of the test file:

```js
import { __setExtractFilters, __setEnrichLeadsImpl, __setGenerateTemplateEmailImpl } from "../../routes/campaigns.js";
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/vedantmadne/Desktop/b2b_sales/backend
npx jest tests/routes/campaigns.test.js --no-coverage -t "template routes"
```

Expected: FAIL — `__setGenerateTemplateEmailImpl is not a function`.

- [ ] **Step 3: Add the route and injection to `campaigns.js`**

At the top of `backend/routes/campaigns.js`, add the import alongside the existing imports:

```js
import { generateTemplateEmail as realGenerateTemplateEmail } from "../services/emailGen.js";
```

After the existing injection variables (near the top, after imports), add:

```js
let generateTemplateEmailImpl = realGenerateTemplateEmail;
export function __setGenerateTemplateEmailImpl(fn) { generateTemplateEmailImpl = fn; }
```

Add the new route immediately before the existing `router.get("/:id/template", ...)` line (around line 593):

```js
router.post("/:id/template/generate", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const draft = await generateTemplateEmailImpl(campaign.rawGoal, brandDoc?.content ?? null);
    res.json(draft);
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/vedantmadne/Desktop/b2b_sales/backend
npx jest tests/routes/campaigns.test.js --no-coverage -t "template routes"
```

Expected: all template route tests PASS (7 existing + 3 new).

- [ ] **Step 5: Run full backend test suite to confirm no regressions**

```bash
cd /Users/vedantmadne/Desktop/b2b_sales/backend
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/campaigns.js backend/tests/routes/campaigns.test.js
git commit -m "feat(campaigns): add POST /:id/template/generate endpoint"
```

---

### Task 3: Add "Generate with AI" button to `EmailTemplatePanel.jsx`

**Files:**
- Modify: `frontend/src/components/EmailTemplatePanel.jsx`

- [ ] **Step 1: Add `generating` state and `handleGenerate` function**

In `EmailTemplatePanel.jsx`, after the existing state declarations (after `const [saveSuccess, setSaveSuccess] = useState(false);`), add:

```js
const [generating, setGenerating] = useState(false);
```

After the existing `handleSwitchToAI` function (around line 119), add:

```js
async function handleGenerate() {
  if ((subject.trim() || body.trim()) && !confirm("Replace existing template with AI-generated content?")) return;
  setGenerating(true);
  setSaveError("");
  try {
    const result = await apiFetch(`/api/campaigns/${campaignId}/template/generate`, {
      token,
      method: "POST"
    });
    setSubject(result.subject ?? "");
    setBody(result.body ?? "");
  } catch (e) {
    setSaveError(e.data?.error || e.message || "Failed to generate template.");
  } finally {
    setGenerating(false);
  }
}
```

- [ ] **Step 2: Add the "Generate with AI" button to the Edit tab**

In the Edit tab section (inside `{tab === "edit" && ...}`), find the Variables label div:

```jsx
<div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Variables — click to insert at cursor</div>
```

Replace it with:

```jsx
<div className="flex justify-between items-center mb-1.5">
  <div className="text-xs text-gray-500 uppercase tracking-wide">Variables — click to insert at cursor</div>
  <button
    onClick={handleGenerate}
    disabled={generating || saving}
    className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded disabled:opacity-40 font-medium"
  >
    {generating ? "Generating…" : "Generate with AI"}
  </button>
</div>
```

- [ ] **Step 3: Verify in the browser**

Start the dev server:

```bash
cd /Users/vedantmadne/Desktop/b2b_sales
npm run dev:backend &
npm run dev:frontend
```

1. Open a campaign that has a `rawGoal`.
2. Open the Email Template panel → Edit tab.
3. Confirm the "Generate with AI" button appears at the top-right of the Variables row.
4. Click it — Subject and Body should be populated with `{{variable}}` placeholders within a few seconds.
5. Confirm the button shows "Generating…" while in flight and re-enables on completion.
6. Confirm the "Save Template" button becomes enabled after generation (fields are non-empty).
7. Edit the generated content, save — verify it persists via a page refresh.
8. Click "Generate with AI" again when fields already have content — confirm the confirm dialog appears; clicking Cancel leaves fields unchanged.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/EmailTemplatePanel.jsx
git commit -m "feat(frontend): add Generate with AI button to Email Template Edit tab"
```
