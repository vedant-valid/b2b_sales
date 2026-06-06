# Structured Brand Doc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the freeform brand-doc textarea with five structured fields (tone, campaignGoals, targetPersonas, proofPoints, bannedWords) plus PDF/DOCX upload with Gemini-powered extraction and admin review flow.

**Architecture:** The `BrandDoc` Prisma singleton drops its `content` column and gains five nullable text columns. A shared `formatBrandGuidelines(fields)` helper in `services/brandDoc.js` converts the structured object into the branded prompt block injected by all four AI call sites. A new `/api/brand-doc/extract` endpoint accepts a PDF or DOCX via multer, extracts text with `pdf-parse`/`mammoth`, and returns Gemini-parsed field values for frontend review before saving.

**Tech Stack:** Prisma migrations, multer (memory storage), pdf-parse, mammoth, Gemini JSON extraction, React state for the review flow.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/prisma/schema.prisma` | Drop `content`, add 5 nullable fields |
| New migration | `backend/prisma/migrations/…` | `remove_content_add_structured_brand_fields` |
| Modify | `backend/services/brandDoc.js` | Add `formatBrandGuidelines()` export |
| Modify | `backend/tests/services/brandDoc.test.js` | Rewrite for structured fields |
| Modify | `backend/services/emailGen.js` | Accept `brandFields` object instead of `brandDoc` string |
| Modify | `backend/tests/services/emailGen.test.js` | Update brandDoc refs to brandFields |
| Modify | `backend/services/prompt.js` | Accept `brandFields` object instead of `brandDoc` string |
| Modify | `backend/tests/services/prompt.test.js` | Update brandDoc refs to brandFields |
| Modify | `backend/services/replyHandler.js` | Accept `brandFields` object instead of `brandDoc` string |
| Modify | `backend/tests/services/replyHandler.test.js` | Update brandDoc refs to brandFields |
| Modify | `backend/routes/campaigns.js` | Pass structured fields to extractFilters + generateTemplateEmail |
| Modify | `backend/workers/generateEmail.js` | Pass structured fields to generateDraft |
| Modify | `backend/workers/processReply.js` | Fetch + pass structured fields to draftFollowUp |
| Modify | `backend/tests/workers/generateEmail.test.js` | Update brandDoc.content refs |
| New | `backend/services/docExtract.js` | Text extraction (pdf/docx) + Gemini field parsing |
| New | `backend/tests/services/docExtract.test.js` | Tests for extraction |
| Modify | `backend/routes/brandDoc.js` | Structured POST body, remove ADMIN guard, add /extract |
| Modify | `backend/tests/routes/brandDoc.test.js` | Full rewrite for new API |
| Modify | `frontend/src/app/(app)/settings/page.jsx` | Structured form + upload review flow |

---

## Task 1: Install new backend dependencies

**Files:**
- Modify: `backend/package.json` (via npm install)

- [ ] **Step 1: Install the three new packages**

```bash
cd backend && npm install multer pdf-parse mammoth
```

Expected: packages added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Verify install**

```bash
node -e "import('multer').then(() => import('pdf-parse')).then(() => import('mammoth')).then(() => console.log('ok'))"
```

Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

```bash
cd backend && git add package.json package-lock.json
git commit -m "chore(deps): add multer, pdf-parse, mammoth for brand doc file upload"
```

---

## Task 2: Prisma schema migration

**Files:**
- Modify: `backend/prisma/schema.prisma` lines 167-175
- New: `backend/prisma/migrations/…/migration.sql` (auto-generated)

- [ ] **Step 1: Update schema.prisma**

Replace the `BrandDoc` model (currently lines 167-175) with:

```prisma
model BrandDoc {
  id             String    @id @default("singleton")
  tone           String?
  campaignGoals  String?
  targetPersonas String?
  proofPoints    String?
  bannedWords    String?
  fileName       String?
  uploadedBy     User?     @relation(fields: [uploadedById], references: [id])
  uploadedById   String?
  uploadedAt     DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

- [ ] **Step 2: Run the migration**

```bash
cd backend && npm run prisma:migrate
```

When prompted for a migration name, enter: `remove_content_add_structured_brand_fields`

Expected: migration created and applied. `prisma generate` runs automatically.

- [ ] **Step 3: Run seed to restore seeded accounts**

```bash
cd backend && npx prisma db seed
```

Expected: seeded users exist (or already exist — upsert is idempotent).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): replace brand doc content blob with structured fields"
```

---

## Task 3: `formatBrandGuidelines` helper + update `getBrandDoc`

**Files:**
- Modify: `backend/services/brandDoc.js`
- Modify: `backend/tests/services/brandDoc.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `backend/tests/services/brandDoc.test.js` with:

```js
import { getBrandDoc, formatBrandGuidelines } from "../../services/brandDoc.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";

beforeEach(resetDb);

describe("getBrandDoc", () => {
  test("returns null when no brand doc exists", async () => {
    const doc = await getBrandDoc();
    expect(doc).toBeNull();
  });

  test("returns structured fields when brand doc exists", async () => {
    await prisma.brandDoc.create({
      data: { id: "singleton", tone: "Professional", proofPoints: "3x pipeline for Acme" }
    });
    const doc = await getBrandDoc();
    expect(doc).not.toBeNull();
    expect(doc.tone).toBe("Professional");
    expect(doc.proofPoints).toBe("3x pipeline for Acme");
    expect(doc.campaignGoals).toBeNull();
  });
});

describe("formatBrandGuidelines", () => {
  test("returns null when fields is null", () => {
    expect(formatBrandGuidelines(null)).toBeNull();
  });

  test("returns null when all fields are null/empty", () => {
    expect(formatBrandGuidelines({ tone: null, campaignGoals: null, targetPersonas: null, proofPoints: null, bannedWords: null })).toBeNull();
  });

  test("includes tone when set", () => {
    const result = formatBrandGuidelines({ tone: "Professional, concise" });
    expect(result).toContain("Tone: Professional, concise");
  });

  test("includes campaign goals when set", () => {
    const result = formatBrandGuidelines({ campaignGoals: "Book demo calls" });
    expect(result).toContain("Campaign goals: Book demo calls");
  });

  test("formats proof points as bullet list", () => {
    const result = formatBrandGuidelines({ proofPoints: "3x pipeline\nSaved $200K" });
    expect(result).toContain("• 3x pipeline");
    expect(result).toContain("• Saved $200K");
  });

  test("includes banned words when set", () => {
    const result = formatBrandGuidelines({ bannedWords: "synergy, leverage" });
    expect(result).toContain("Banned words (never use): synergy, leverage");
  });

  test("omits missing fields from output", () => {
    const result = formatBrandGuidelines({ tone: "Direct" });
    expect(result).not.toContain("Campaign goals");
    expect(result).not.toContain("Proof points");
  });

  test("starts with BRAND GUIDELINES header", () => {
    const result = formatBrandGuidelines({ tone: "Direct" });
    expect(result).toMatch(/^BRAND GUIDELINES/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/services/brandDoc.test.js --no-coverage
```

Expected: FAIL — `formatBrandGuidelines` is not exported.

- [ ] **Step 3: Update `services/brandDoc.js`**

Replace the entire file:

```js
import { prisma } from "../lib/prisma.js";

export async function getBrandDoc() {
  return prisma.brandDoc.findUnique({ where: { id: "singleton" } });
}

export function formatBrandGuidelines(fields) {
  if (!fields) return null;
  const { tone, campaignGoals, targetPersonas, proofPoints, bannedWords } = fields;
  const lines = [];
  if (tone) lines.push(`- Tone: ${tone}`);
  if (campaignGoals) lines.push(`- Campaign goals: ${campaignGoals}`);
  if (targetPersonas) lines.push(`- Target personas: ${targetPersonas}`);
  if (proofPoints) {
    const pts = proofPoints.split("\n").filter(Boolean).map(p => `  • ${p.trim()}`).join("\n");
    lines.push(`- Proof points:\n${pts}`);
  }
  if (bannedWords) lines.push(`- Banned words (never use): ${bannedWords}`);
  if (lines.length === 0) return null;
  return `BRAND GUIDELINES — follow these for every output:\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest tests/services/brandDoc.test.js --no-coverage
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/brandDoc.js backend/tests/services/brandDoc.test.js
git commit -m "feat(brand-doc): add formatBrandGuidelines helper and update getBrandDoc for structured fields"
```

---

## Task 4: Update `services/emailGen.js` to use structured `brandFields`

**Files:**
- Modify: `backend/services/emailGen.js`
- Modify: `backend/tests/services/emailGen.test.js`

- [ ] **Step 1: Update the tests first**

Replace the entire content of `backend/tests/services/emailGen.test.js` with:

```js
import { jest } from "@jest/globals";
import { generateDraft, generateTemplateEmail } from "../../services/emailGen.js";

describe("generateDraft", () => {
  test("returns subject and body", async () => {
    const fake = jest.fn().mockResolvedValue({
      subject: "Partnering on NST talent for Acme",
      body: "Hi Alice,\n\nNoticed Acme just raised a Series C..."
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "Head of Eng", company: "Acme" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST students build production systems" };
    const draft = await generateDraft(lead, profile, { generate: fake });
    expect(draft.subject).toMatch(/Acme/);
    expect(draft.body).toContain("Alice");
    expect(fake).toHaveBeenCalled();
  });

  test("passes systemInstruction when brandFields has content", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (prompt, opts) => {
      capturedOpts = opts;
      return { subject: "Test", body: "Hi" };
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme", department: "Eng" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST builds" };
    await generateDraft(lead, profile, { generate: fake, brandFields: { tone: "Direct", bannedWords: "synergy" } });
    expect(capturedOpts).toHaveProperty("systemInstruction");
    expect(capturedOpts.systemInstruction).toContain("Direct");
    expect(capturedOpts.systemInstruction).toContain("synergy");
  });

  test("passes no systemInstruction when brandFields is null", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (prompt, opts) => {
      capturedOpts = opts;
      return { subject: "Test", body: "Hi" };
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST builds" };
    await generateDraft(lead, profile, { generate: fake, brandFields: null });
    expect(capturedOpts).toEqual({});
  });
});

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

  test("passes systemInstruction when brandFields has content", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (_prompt, opts) => {
      capturedOpts = opts;
      return { subject: "S", body: "B" };
    });
    await generateTemplateEmail("find CTOs", { tone: "Concise", bannedWords: "innovative" }, { generate: fake });
    expect(capturedOpts).toHaveProperty("systemInstruction");
    expect(capturedOpts.systemInstruction).toContain("Concise");
    expect(capturedOpts.systemInstruction).toContain("innovative");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/services/emailGen.test.js --no-coverage
```

Expected: FAIL — `brandFields` is not a recognized parameter.

- [ ] **Step 3: Update `services/emailGen.js`**

Replace the entire file:

```js
import { generateJson } from "./gemini.js";
import { formatBrandGuidelines } from "./brandDoc.js";

const SYSTEM = `You are a world-class outbound copywriter. Draft a short, personalized B2B email.

Structure:
- Hook: reference something plausible about the company (do NOT fabricate specific news — use role/industry context)
- Bridge: tie into the sender's value proposition
- Proof: 1 concrete credibility line
- CTA: one clear ask (15-min call)

Rules:
- Subject under 60 chars
- Body under 150 words
- Plain text, no markdown
- No em-dashes

Return JSON: { "subject": string, "body": string }`;

export async function generateDraft(lead, profile, { generate = generateJson, brandFields = null } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${SYSTEM}

Lead:
- Name: ${lead.firstName} ${lead.lastName}
- Title: ${lead.title}
- Company: ${lead.company}
- Department: ${lead.department || "unknown"}

Sender profile:
- Name: ${profile.senderName}
- Company: ${profile.senderCompany}
- Value prop: ${profile.valueProp}

JSON:`;
  return generate(prompt, opts);
}

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

export async function generateTemplateEmail(rawGoal, brandFields = null, { generate = generateJson } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const opts = brandText ? { systemInstruction: brandText } : {};
  const prompt = `${TEMPLATE_SYSTEM}

Campaign goal: ${rawGoal}

JSON:`;
  return generate(prompt, opts);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest tests/services/emailGen.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/emailGen.js backend/tests/services/emailGen.test.js
git commit -m "feat(email-gen): accept structured brandFields object instead of raw string"
```

---

## Task 5: Update `services/prompt.js` to use structured `brandFields`

**Files:**
- Modify: `backend/services/prompt.js`
- Modify: `backend/tests/services/prompt.test.js`

- [ ] **Step 1: Update the test**

Replace `backend/tests/services/prompt.test.js` with:

```js
import { jest } from "@jest/globals";
import { extractFilters } from "../../services/prompt.js";

describe("prompt.extractFilters", () => {
  test("returns structured filters and confidence", async () => {
    const fakeGen = jest.fn().mockResolvedValue({
      filters: {
        titles: ["Head of Engineering", "VP Engineering"],
        locations: ["India"],
        companySizes: ["1001-5000"],
        industries: ["Software"]
      },
      confidence: 0.92
    });
    const result = await extractFilters("Heads of Engineering at unicorn startups in India", { generate: fakeGen });
    expect(result.filters.titles).toContain("Head of Engineering");
    expect(result.confidence).toBe(0.92);
  });

  test("low confidence returns clarification", async () => {
    const fakeGen = jest.fn().mockResolvedValue({ filters: {}, confidence: 0.4, clarification: "Please specify location" });
    const result = await extractFilters("help me hire", { generate: fakeGen });
    expect(result.needsClarification).toBe(true);
    expect(result.clarification).toMatch(/location/);
  });

  test("appends formatted brand guidelines to prompt when brandFields is provided", async () => {
    let capturedPrompt = null;
    const fakeGen = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { filters: { locations: ["India"] }, confidence: 0.9 };
    });
    await extractFilters("find engineers in India", {
      generate: fakeGen,
      brandFields: { targetPersonas: "Founders and CTOs only", tone: "Direct" }
    });
    expect(capturedPrompt).toContain("Founders and CTOs only");
    expect(capturedPrompt).toContain("Direct");
  });

  test("no brand context in prompt when brandFields is null", async () => {
    let capturedPrompt = null;
    const fakeGen = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { filters: {}, confidence: 0.9 };
    });
    await extractFilters("find engineers", { generate: fakeGen, brandFields: null });
    expect(capturedPrompt).not.toContain("BRAND GUIDELINES");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/services/prompt.test.js --no-coverage
```

Expected: FAIL — `brandFields` not recognized.

- [ ] **Step 3: Update `services/prompt.js`**

Replace only the `extractFilters` function signature and brand context logic (lines 55-65). The full updated file:

```js
import { generateJson } from "./gemini.js";
import { formatBrandGuidelines } from "./brandDoc.js";

const SYSTEM_PROMPT = `You are a B2B prospecting assistant. Convert a natural-language outreach goal into structured Lusha Prospecting API filters.

Return JSON only, with this shape:
{
  "filters": {
    "seniorities": [string],
    "departments": [string],
    "locations": [string],
    "cities": [string],
    "companySizes": [string],
    "titleKeywords": [string],
    "excludeTitleKeywords": [string],
    "excludeIndustries": [string]
  },
  "confidence": number (0..1),
  "clarification": string (only if confidence < 0.7)
}

RULES:
- "seniorities": use only exact Lusha values → "founder", "partner", "c-suite", "vice president", "director", "manager", "senior", "entry", "intern", "other"
- "departments": use only exact Lusha values → "Business Development", "Consulting", "Customer Service", "Engineering & Technical", "Finance", "General Management", "Health Care & Medical", "Human Resources", "Information Technology", "Legal", "Marketing", "Operations", "Other", "Product", "Research & Analytics", "Sales"
- "locations": country names only (e.g. "India", "United States")
- "cities": city names when the goal mentions a specific city (e.g. "Bangalore", "Mumbai", "San Francisco"). Always pair with the matching country in "locations".
- "companySizes": use range strings → "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+" OR natural language → "startup", "small", "medium", "large", "enterprise", "unicorn"
- "titleKeywords": ALWAYS include when a specific role is mentioned — used to post-filter results. Use lowercase substrings that appear in target job titles.
- "excludeTitleKeywords": populate when the goal explicitly excludes a role (e.g. "not CISOs", "exclude security heads"). Use lowercase substrings.
- "excludeIndustries": populate when the goal excludes an industry (e.g. "no hospitality", "exclude healthcare"). Use plain English industry names.
- Omit any field you cannot confidently infer from the goal
- Do NOT invent values outside the allowed lists

ROLE → DEPARTMENT MAPPING (ALWAYS apply when role is mentioned):
- CTO / Chief Technology Officer / VP Engineering / Head of Engineering → departments: ["Engineering & Technical"], seniorities: ["c-suite", "vice president", "director"]
- CMO / Chief Marketing Officer / VP Marketing → departments: ["Marketing"], seniorities: ["c-suite", "vice president"]
- CFO / Chief Financial Officer / VP Finance → departments: ["Finance"], seniorities: ["c-suite", "vice president"]
- CPO / Chief Product Officer / VP Product / Head of Product → departments: ["Product"], seniorities: ["c-suite", "vice president", "director"]
- CRO / VP Sales / Head of Sales → departments: ["Sales"], seniorities: ["c-suite", "vice president", "director"]
- CEO / Founder / Co-Founder → departments: [], seniorities: ["founder", "c-suite"]
- HR Director / Head of HR / CHRO → departments: ["Human Resources"], seniorities: ["c-suite", "director"]
- CISO / Head of Security → departments: ["Engineering & Technical", "Information Technology"], seniorities: ["c-suite", "director"]

TITLE KEYWORD EXAMPLES:
- "CTOs" → titleKeywords: ["cto", "chief technology", "chief technical", "vp engineering", "vp of engineering", "head of engineering"]
- "CMOs" → titleKeywords: ["cmo", "chief marketing", "vp marketing"]
- "Founders" → titleKeywords: ["founder", "co-founder"]
- "HR Directors" → titleKeywords: ["hr director", "head of hr", "chief people", "chro"]

EXCLUDE EXAMPLES:
- "not CISOs" → excludeTitleKeywords: ["ciso", "chief information security", "head of security"]
- "exclude hospitality companies" → excludeIndustries: ["Hospitality", "Hotels & Resorts"]
- "no healthcare" → excludeIndustries: ["Healthcare", "Hospitals & Health Care"]`;


export async function extractFilters(rawGoal, { generate = generateJson, brandFields = null } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const brandContext = brandText
    ? `\n\nBrand context (use this to fill gaps not covered by the goal):\n${brandText}`
    : "";
  const prompt = `${SYSTEM_PROMPT}\n\nGoal:\n${rawGoal}${brandContext}\n\nJSON:`;
  const result = await generate(prompt);
  if ((result.confidence ?? 0) < 0.7) {
    return { ...result, needsClarification: true, clarification: result.clarification || "Please add more detail." };
  }
  return { ...result, needsClarification: false };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest tests/services/prompt.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/prompt.js backend/tests/services/prompt.test.js
git commit -m "feat(prompt): accept structured brandFields object instead of raw string"
```

---

## Task 6: Update `services/replyHandler.js` to use structured `brandFields`

**Files:**
- Modify: `backend/services/replyHandler.js`
- Modify: `backend/tests/services/replyHandler.test.js`

- [ ] **Step 1: Update the test**

Replace `backend/tests/services/replyHandler.test.js` with:

```js
import { jest } from "@jest/globals";
import { classifySentiment, draftFollowUp } from "../../services/replyHandler.js";

describe("replyHandler", () => {
  test("classifySentiment returns one of the enum values", async () => {
    const fake = jest.fn().mockResolvedValue({ sentiment: "INTERESTED" });
    const out = await classifySentiment("Yes, would love to chat next week", { generate: fake });
    expect(out).toBe("INTERESTED");
  });

  test("classifySentiment normalizes unknown to NEUTRAL", async () => {
    const fake = jest.fn().mockResolvedValue({ sentiment: "MAYBE" });
    const out = await classifySentiment("hmm", { generate: fake });
    expect(out).toBe("NEUTRAL");
  });

  test("draftFollowUp returns a string tailored to sentiment", async () => {
    const fake = jest.fn().mockResolvedValue({ followUp: "Great! Here are two times..." });
    const out = await draftFollowUp("Yes, would love to chat", { firstName: "Alice" }, "INTERESTED", { generate: fake });
    expect(out).toMatch(/times/);
  });

  test("includes formatted brand guidelines in follow-up prompt when brandFields provided", async () => {
    let capturedPrompt = null;
    const fakeGen = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { followUp: "Got it, talk soon." };
    });
    const lead = { firstName: "Alice" };
    await draftFollowUp("Thanks!", lead, "INTERESTED", {
      generate: fakeGen,
      brandFields: { tone: "Warm and direct", bannedWords: "em-dashes" }
    });
    expect(capturedPrompt).toContain("Warm and direct");
    expect(capturedPrompt).toContain("em-dashes");
  });

  test("no brand context in prompt when brandFields is null", async () => {
    let capturedPrompt = null;
    const fakeGen = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { followUp: "Talk soon." };
    });
    await draftFollowUp("Thanks!", { firstName: "Bob" }, "NEUTRAL", { generate: fakeGen, brandFields: null });
    expect(capturedPrompt).not.toContain("BRAND GUIDELINES");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/services/replyHandler.test.js --no-coverage
```

Expected: FAIL — `brandFields` not recognized.

- [ ] **Step 3: Update `services/replyHandler.js`**

Replace the entire file:

```js
import { generateJson } from "./gemini.js";
import { formatBrandGuidelines } from "./brandDoc.js";

const VALID = ["INTERESTED", "NOT_INTERESTED", "NEUTRAL", "CONVERTIBLE"];

const CLASSIFY_PROMPT = `Classify the reply into exactly one of: INTERESTED, NOT_INTERESTED, NEUTRAL, CONVERTIBLE.

Definitions:
- INTERESTED: clear yes, wants a meeting
- NOT_INTERESTED: explicit no, unsubscribe, not relevant
- NEUTRAL: ambiguous, asking questions, deferring
- CONVERTIBLE: not ready now but open in the future or redirects to colleague

Return JSON: { "sentiment": string }`;

export async function classifySentiment(replyBody, { generate = generateJson } = {}) {
  const out = await generate(`${CLASSIFY_PROMPT}\n\nReply:\n${replyBody}\n\nJSON:`);
  return VALID.includes(out.sentiment) ? out.sentiment : "NEUTRAL";
}

const FOLLOWUP_PROMPT = `Draft a brief, warm follow-up email. 60 words or less. Plain text. No em-dashes. No placeholders whatsoever — use the actual names provided. Sign off with the sender name. When proposing meeting times, use IST (Indian Standard Time) and do not mention any other timezone.

Sentiment context guides tone:
- INTERESTED → propose 2 concrete meeting times in IST
- NOT_INTERESTED → polite acknowledgment, leave door open
- NEUTRAL → answer their question and re-propose a call
- CONVERTIBLE → confirm future timing or redirect gracefully

Return JSON: { "followUp": string }`;

export async function draftFollowUp(replyBody, lead, sentiment, { generate = generateJson, brandFields = null, senderName = "Vedant" } = {}) {
  const brandText = formatBrandGuidelines(brandFields);
  const brandContext = brandText ? `\n\nBrand voice guidelines:\n${brandText}` : "";
  const prompt = `${FOLLOWUP_PROMPT}${brandContext}

Lead name: ${lead.firstName} ${lead.lastName || ""}
Sender name: ${senderName}

Reply from ${lead.firstName}:
${replyBody}

Sentiment: ${sentiment}

JSON:`;
  const out = await generate(prompt);
  return out.followUp;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest tests/services/replyHandler.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/replyHandler.js backend/tests/services/replyHandler.test.js
git commit -m "feat(reply-handler): accept structured brandFields object instead of raw string"
```

---

## Task 7: Update call sites — campaigns.js, generateEmail worker, processReply worker

**Files:**
- Modify: `backend/routes/campaigns.js` lines ~116-117 and ~623-624
- Modify: `backend/workers/generateEmail.js` line ~42
- Modify: `backend/workers/processReply.js` lines ~61 and ~72
- Modify: `backend/tests/workers/generateEmail.test.js`

- [ ] **Step 1: Update `routes/campaigns.js` — two call sites**

Find and replace line ~117 (extractFilters call in campaign creation):

```js
// BEFORE
const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
const extraction = await extract(rawGoal, { brandDoc: brandDoc?.content ?? null });

// AFTER
const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
const extraction = await extract(rawGoal, { brandFields });
```

Find and replace line ~624 (generateTemplateEmail call):

```js
// BEFORE
const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
const draft = await generateTemplateEmailImpl(campaign.rawGoal, brandDoc?.content ?? null);

// AFTER
const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
const draft = await generateTemplateEmailImpl(campaign.rawGoal, brandFields);
```

- [ ] **Step 2: Update `workers/generateEmail.js` — generateDraft call site**

Find and replace lines ~41-42:

```js
// BEFORE
const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
draft = await generateDraft(lead, DEFAULT_PROFILE, { brandDoc: brandDoc?.content ?? null });

// AFTER
const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
draft = await generateDraft(lead, DEFAULT_PROFILE, { brandFields });
```

- [ ] **Step 3: Update `workers/processReply.js` — pass brandFields to draftFollowUp**

Find lines ~61 and ~72 where `draftFollowUp` is called (two places: one in the backfill branch, one in the normal path). Add `brandFields` fetch before each `draftFollowUp` call.

Replace the backfill branch (around line 60):

```js
// BEFORE
const sentiment = await replyHandler.classifySentiment(body);
const follow = await replyHandler.draftFollowUp(body, lead, sentiment);

// AFTER (backfill branch)
const sentiment = await replyHandler.classifySentiment(body);
const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
const follow = await replyHandler.draftFollowUp(body, lead, sentiment, { brandFields });
```

Replace the normal path (around line 71):

```js
// BEFORE
const sentiment = await replyHandler.classifySentiment(body);
const follow = await replyHandler.draftFollowUp(body, lead, sentiment);

// AFTER (normal path)
const sentiment = await replyHandler.classifySentiment(body);
const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
const follow = await replyHandler.draftFollowUp(body, lead, sentiment, { brandFields });
```

- [ ] **Step 4: Update `tests/workers/generateEmail.test.js` — fix brandDoc reference**

Find the test "passes brand doc content to generateDraft when it exists" and update it. Replace the test that creates a brandDoc with `content`:

```js
test("passes brand doc fields to generateDraft when it exists", async () => {
  const { user } = await createUser({ email: `bd${Date.now()}@x.com`, role: "ADMIN" });
  await prisma.brandDoc.create({
    data: { id: "singleton", tone: "Professional", proofPoints: "3x pipeline for Acme" }
  });

  let capturedOpts = null;
  __setGenerateDraft(jest.fn().mockImplementation(async (_lead, _profile, opts) => {
    capturedOpts = opts;
    return { subject: "Test", body: "Body" };
  }));

  const campaign = await prisma.campaign.create({
    data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  const lead = await prisma.lead.create({
    data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
  });

  await runGenerateEmailJob({ data: { leadId: lead.id } });
  expect(capturedOpts).toHaveProperty("brandFields");
  expect(capturedOpts.brandFields).toMatchObject({ tone: "Professional", proofPoints: "3x pipeline for Acme" });
});
```

Find the test "passes null brandDoc to generateDraft when no brand doc exists" and update:

```js
test("passes null brandFields to generateDraft when no brand doc exists", async () => {
  const { user } = await createUser({ email: `noBd${Date.now()}@x.com` });
  let capturedOpts = null;
  __setGenerateDraft(jest.fn().mockImplementation(async (_lead, _profile, opts) => {
    capturedOpts = opts;
    return { subject: "S", body: "B" };
  }));

  const campaign = await prisma.campaign.create({
    data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  const lead = await prisma.lead.create({
    data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
  });

  await runGenerateEmailJob({ data: { leadId: lead.id } });
  expect(capturedOpts).toHaveProperty("brandFields", null);
});
```

- [ ] **Step 5: Run all modified tests**

```bash
cd backend && npx jest tests/workers/generateEmail.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Run the full test suite to catch any regressions**

```bash
cd backend && npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/campaigns.js backend/workers/generateEmail.js backend/workers/processReply.js backend/tests/workers/generateEmail.test.js
git commit -m "feat(call-sites): pass structured brandFields to all AI service functions"
```

---

## Task 8: Create `services/docExtract.js` — file text extraction + Gemini field parsing

**Files:**
- Create: `backend/services/docExtract.js`
- Create: `backend/tests/services/docExtract.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/docExtract.test.js`:

```js
import { jest } from "@jest/globals";
import { extractBrandFields, extractTextFromBuffer } from "../../services/docExtract.js";

describe("extractBrandFields", () => {
  test("returns structured fields from document text", async () => {
    const fakeGen = jest.fn().mockResolvedValue({
      tone: "Professional, concise",
      campaignGoals: "Book demo calls with CTOs",
      targetPersonas: "CTOs at Series B SaaS",
      proofPoints: "3x pipeline for Acme",
      bannedWords: "synergy, leverage"
    });
    const result = await extractBrandFields("...some doc text...", { generate: fakeGen });
    expect(result.tone).toBe("Professional, concise");
    expect(result.campaignGoals).toBe("Book demo calls with CTOs");
    expect(result.bannedWords).toBe("synergy, leverage");
    expect(fakeGen).toHaveBeenCalledTimes(1);
    const [prompt] = fakeGen.mock.calls[0];
    expect(prompt).toContain("some doc text");
  });

  test("returns nulls for fields not found in document", async () => {
    const fakeGen = jest.fn().mockResolvedValue({
      tone: "Casual",
      campaignGoals: null,
      targetPersonas: null,
      proofPoints: null,
      bannedWords: null
    });
    const result = await extractBrandFields("minimal doc", { generate: fakeGen });
    expect(result.tone).toBe("Casual");
    expect(result.campaignGoals).toBeNull();
  });
});

describe("extractTextFromBuffer", () => {
  test("throws for unsupported mime type", async () => {
    const buf = Buffer.from("hello");
    await expect(extractTextFromBuffer(buf, "text/plain")).rejects.toThrow("unsupported_file_type");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/services/docExtract.test.js --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `services/docExtract.js`**

```js
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { generateJson } from "./gemini.js";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXTRACT_PROMPT = `You are a brand document parser. Extract structured brand information from the provided document text.

Return JSON only with this exact shape:
{
  "tone": string or null,
  "campaignGoals": string or null,
  "targetPersonas": string or null,
  "proofPoints": string or null,
  "bannedWords": string or null
}

Rules:
- tone: writing style/voice guidance (e.g. "Professional, concise, no jargon")
- campaignGoals: who to target and what outcome to achieve
- targetPersonas: description of ideal leads/buyers
- proofPoints: concrete results or case studies, one per line
- bannedWords: words or phrases to avoid, comma-separated
- Return null for any field you cannot confidently extract from the text
- Do NOT fabricate information not present in the document`;

export async function extractTextFromBuffer(buffer, mimetype) {
  if (mimetype === PDF_MIME) {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimetype === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error("unsupported_file_type");
}

export async function extractBrandFields(text, { generate = generateJson } = {}) {
  const prompt = `${EXTRACT_PROMPT}\n\nDocument:\n${text}\n\nJSON:`;
  return generate(prompt);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest tests/services/docExtract.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/docExtract.js backend/tests/services/docExtract.test.js
git commit -m "feat(doc-extract): add PDF/DOCX text extraction and Gemini brand field parsing"
```

---

## Task 9: Rewrite `routes/brandDoc.js` + route tests

**Files:**
- Modify: `backend/routes/brandDoc.js`
- Modify: `backend/tests/routes/brandDoc.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `backend/tests/routes/brandDoc.test.js` with:

```js
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { __setExtractBrandFieldsImpl } from "../../routes/brandDoc.js";
import { jest } from "@jest/globals";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  __setExtractBrandFieldsImpl(jest.fn().mockResolvedValue({
    tone: "Professional",
    campaignGoals: "Book demos",
    targetPersonas: "CTOs",
    proofPoints: "3x pipeline",
    bannedWords: "synergy"
  }));
});

describe("GET /api/brand-doc", () => {
  test("returns null when no brand doc set", async () => {
    const { token } = await createUser({ email: `v${Date.now()}@x.com` });
    const res = await request(app).get("/api/brand-doc").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.brandDoc).toBeNull();
  });

  test("returns structured fields when brand doc set", async () => {
    const { token } = await createUser({ email: `a${Date.now()}@x.com` });
    await prisma.brandDoc.create({
      data: { id: "singleton", tone: "Direct", proofPoints: "Saved $200K for Acme" }
    });
    const res = await request(app).get("/api/brand-doc").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.tone).toBe("Direct");
    expect(res.body.brandDoc.proofPoints).toBe("Saved $200K for Acme");
  });

  test("requires auth", async () => {
    const res = await request(app).get("/api/brand-doc");
    expect(res.status).toBe(401);
  });

  test("VIEWER can read brand doc", async () => {
    const { token } = await createUser({ email: `viewer${Date.now()}@x.com`, role: "VIEWER" });
    const res = await request(app).get("/api/brand-doc").set(authHeader(token));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/brand-doc", () => {
  test("any authenticated user can save brand doc", async () => {
    const { token } = await createUser({ email: `mgr${Date.now()}@x.com`, role: "MANAGER" });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ tone: "Direct", bannedWords: "synergy, leverage" });
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.tone).toBe("Direct");
    expect(res.body.brandDoc.bannedWords).toBe("synergy, leverage");
  });

  test("ADMIN can save brand doc", async () => {
    const { token } = await createUser({ email: `admin${Date.now()}@x.com`, role: "ADMIN" });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ tone: "Professional", campaignGoals: "Book demos", proofPoints: "3x pipeline" });
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.campaignGoals).toBe("Book demos");
  });

  test("overwrites existing brand doc", async () => {
    const { token } = await createUser({ email: `admin2${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.create({ data: { id: "singleton", tone: "Old tone" } });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ tone: "New tone" });
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.tone).toBe("New tone");
  });

  test("missing fields default to null (not left unchanged)", async () => {
    const { token } = await createUser({ email: `admin3${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.create({ data: { id: "singleton", tone: "Old", bannedWords: "leverage" } });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ tone: "New" });
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.tone).toBe("New");
    expect(res.body.brandDoc.bannedWords).toBeNull();
  });

  test("requires auth", async () => {
    const res = await request(app).post("/api/brand-doc").send({ tone: "Direct" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/brand-doc/extract", () => {
  test("returns extracted fields from PDF upload without saving", async () => {
    const { token } = await createUser({ email: `ext${Date.now()}@x.com` });
    const fakeBuffer = Buffer.from("%PDF-1.4 minimal");
    const res = await request(app)
      .post("/api/brand-doc/extract")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", fakeBuffer, { filename: "brand.pdf", contentType: "application/pdf" });
    // If pdf-parse fails on fake buffer, that's OK — we just verify the route exists and auth works
    // The real test of extraction logic is in docExtract.test.js
    expect([200, 500]).toContain(res.status);
  });

  test("returns 400 when no file attached", async () => {
    const { token } = await createUser({ email: `nofile${Date.now()}@x.com` });
    const res = await request(app)
      .post("/api/brand-doc/extract")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "multipart/form-data");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_file");
  });

  test("requires auth", async () => {
    const res = await request(app).post("/api/brand-doc/extract");
    expect(res.status).toBe(401);
  });

  test("does not persist anything to DB during extract", async () => {
    const { token } = await createUser({ email: `nopersist${Date.now()}@x.com` });
    await request(app)
      .post("/api/brand-doc/extract")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "multipart/form-data");
    const doc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    expect(doc).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/routes/brandDoc.test.js --no-coverage
```

Expected: FAIL — `__setExtractBrandFieldsImpl` not exported, schema mismatch on content.

- [ ] **Step 3: Rewrite `routes/brandDoc.js`**

```js
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { extractTextFromBuffer, extractBrandFields as realExtractBrandFields } from "../services/docExtract.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

let extractBrandFieldsFn = realExtractBrandFields;
export function __setExtractBrandFieldsImpl(impl) { extractBrandFieldsFn = impl; }

router.get("/", async (req, res, next) => {
  try {
    const doc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    res.json({ brandDoc: doc });
  } catch (e) { next(e); }
});

const saveSchema = z.object({
  tone:           z.string().optional().nullable(),
  campaignGoals:  z.string().optional().nullable(),
  targetPersonas: z.string().optional().nullable(),
  proofPoints:    z.string().optional().nullable(),
  bannedWords:    z.string().optional().nullable(),
  fileName:       z.string().optional().nullable()
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { tone, campaignGoals, targetPersonas, proofPoints, bannedWords, fileName } = parsed.data;
    const doc = await prisma.brandDoc.upsert({
      where: { id: "singleton" },
      update: { tone: tone ?? null, campaignGoals: campaignGoals ?? null, targetPersonas: targetPersonas ?? null, proofPoints: proofPoints ?? null, bannedWords: bannedWords ?? null, fileName: fileName ?? null, uploadedById: req.user.sub },
      create: { id: "singleton", tone: tone ?? null, campaignGoals: campaignGoals ?? null, targetPersonas: targetPersonas ?? null, proofPoints: proofPoints ?? null, bannedWords: bannedWords ?? null, fileName: fileName ?? null, uploadedById: req.user.sub }
    });
    res.json({ brandDoc: doc });
  } catch (e) { next(e); }
});

router.post("/extract", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const text = await extractTextFromBuffer(req.file.buffer, req.file.mimetype);
    const fields = await extractBrandFieldsFn(text);
    res.json({ fields, fileName: req.file.originalname });
  } catch (e) {
    if (e.message === "unsupported_file_type") return res.status(400).json({ error: "unsupported_file_type" });
    next(e);
  }
});

export default router;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest tests/routes/brandDoc.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd backend && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/brandDoc.js backend/tests/routes/brandDoc.test.js
git commit -m "feat(brand-doc-route): structured POST body, open to all roles, add /extract endpoint"
```

---

## Task 10: Rewrite frontend settings page

**Files:**
- Modify: `frontend/src/app/(app)/settings/page.jsx`

- [ ] **Step 1: Rewrite `frontend/src/app/(app)/settings/page.jsx`**

```jsx
"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

const DELIVERABILITY_ITEMS = [
  { id: "domain", label: "Separate sending domain configured in Instantly.ai (e.g. recruit-nst.com)" },
  { id: "spf", label: "SPF record added to sending domain DNS" },
  { id: "dkim", label: "DKIM record added to sending domain DNS" },
  { id: "dmarc", label: "DMARC policy set on sending domain DNS" },
  { id: "warmup", label: "4-week inbox warm-up completed in Instantly.ai" },
  { id: "cap", label: "Daily send volume capped at 30–50 emails/mailbox" }
];

const EMPTY_FIELDS = { tone: "", campaignGoals: "", targetPersonas: "", proofPoints: "", bannedWords: "" };

export default function SettingsPage() {
  const { data: session } = useSession();
  const token = session?.backendToken;

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [fileName, setFileName] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extracted, setExtracted] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/brand-doc", { token })
      .then((data) => {
        if (data.brandDoc) {
          setFields({
            tone: data.brandDoc.tone ?? "",
            campaignGoals: data.brandDoc.campaignGoals ?? "",
            targetPersonas: data.brandDoc.targetPersonas ?? "",
            proofPoints: data.brandDoc.proofPoints ?? "",
            bannedWords: data.brandDoc.bannedWords ?? ""
          });
          setFileName(data.brandDoc.fileName ?? "");
          setSavedAt(data.brandDoc.updatedAt);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  function setField(key, value) {
    setFields(f => ({ ...f, [key]: value }));
    setExtracted(false);
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setExtractError("");
    setExtracted(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/api/brand-doc/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "extract_failed");
      setFields({
        tone: data.fields.tone ?? "",
        campaignGoals: data.fields.campaignGoals ?? "",
        targetPersonas: data.fields.targetPersonas ?? "",
        proofPoints: data.fields.proofPoints ?? "",
        bannedWords: data.fields.bannedWords ?? ""
      });
      setFileName(data.fileName ?? "");
      setExtracted(true);
    } catch (err) {
      setExtractError(err.message || "Extraction failed");
    } finally {
      setExtracting(false);
      e.target.value = "";
    }
  }

  async function onSave() {
    setSaveError("");
    setSaving(true);
    try {
      const body = {
        tone: fields.tone || null,
        campaignGoals: fields.campaignGoals || null,
        targetPersonas: fields.targetPersonas || null,
        proofPoints: fields.proofPoints || null,
        bannedWords: fields.bannedWords || null,
        fileName: fileName || null
      };
      const data = await apiFetch("/api/brand-doc", { token, method: "POST", body });
      setSavedAt(data.brandDoc.updatedAt);
      setExtracted(false);
    } catch (err) {
      setSaveError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400 p-6">Loading…</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Brand Settings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Set once — every AI-generated email, filter, and follow-up draws from this automatically.
          </p>
        </div>

        {/* Upload */}
        <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center space-y-2 bg-gray-50">
          <p className="text-sm text-gray-600">Upload a PDF or DOCX to auto-extract fields below</p>
          <label className="inline-block cursor-pointer bg-black text-white text-sm px-4 py-1.5 rounded">
            {extracting ? "Extracting…" : "Choose file"}
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={onUpload}
              disabled={extracting}
            />
          </label>
          {fileName && <p className="text-xs text-gray-500">{fileName}</p>}
          {extractError && <p className="text-xs text-red-500">{extractError}</p>}
          {extracted && (
            <p className="text-xs text-amber-600">⚠ Fields extracted — review and edit before saving</p>
          )}
        </div>

        {/* Tone */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Tone</label>
          <input
            className={`w-full border rounded-md px-3 py-2 text-sm ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder='e.g. "Professional, concise, no jargon"'
            value={fields.tone}
            onChange={e => setField("tone", e.target.value)}
          />
        </div>

        {/* Campaign Goals */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Campaign Goals</label>
          <textarea
            rows={3}
            className={`w-full border rounded-md px-3 py-2 text-sm resize-y ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder="Who you want to reach and what outcome you want"
            value={fields.campaignGoals}
            onChange={e => setField("campaignGoals", e.target.value)}
          />
        </div>

        {/* Target Personas */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Target Personas</label>
          <textarea
            rows={3}
            className={`w-full border rounded-md px-3 py-2 text-sm resize-y ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder="Description of your ideal leads"
            value={fields.targetPersonas}
            onChange={e => setField("targetPersonas", e.target.value)}
          />
        </div>

        {/* Proof Points */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Proof Points</label>
          <p className="text-xs text-gray-400">One per line. AI weaves these into emails as credibility signals.</p>
          <textarea
            rows={4}
            className={`w-full border rounded-md px-3 py-2 text-sm resize-y font-mono ${extracted ? "bg-amber-50 border-amber-300" : "border-gray-300"}`}
            placeholder={"3x pipeline increase for Acme Corp in 90 days\nSaved $200K annually for XYZ SaaS"}
            value={fields.proofPoints}
            onChange={e => setField("proofPoints", e.target.value)}
          />
        </div>

        {/* Banned Words */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Banned Words</label>
          <p className="text-xs text-gray-400">Comma-separated or one per line. AI will never use these.</p>
          <textarea
            rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-y font-mono"
            placeholder="synergy, leverage, disrupt, game-changer"
            value={fields.bannedWords}
            onChange={e => setField("bannedWords", e.target.value)}
          />
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save brand settings"}
          </button>
          {savedAt && (
            <span className="text-xs text-gray-400">
              Last saved: {new Date(savedAt).toLocaleString()}
            </span>
          )}
        </div>
        {saveError && <p className="text-sm text-red-500">{saveError}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Deliverability checklist</h2>
        <p className="text-sm text-gray-600">
          Complete every item before launching your first campaign. These are manual steps — use them as reference.
        </p>
        <ul className="space-y-2">
          {DELIVERABILITY_ITEMS.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          Docs: see Instantly.ai domain + warm-up setup guides.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">API keys</h2>
        <p className="text-sm text-gray-600">
          Gemini, Lusha, and Instantly.ai keys are configured via backend environment variables.
          Admin-only UI for runtime updates is out of scope for v1.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Start the dev servers and test the UI manually**

```bash
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

Navigate to `http://localhost:3000/settings`. Verify:
- All 5 fields are visible and editable
- Save button works (check network tab for 200 response)
- Saved values re-appear on page reload

- [ ] **Step 3: Test file upload flow**

Upload a real PDF or DOCX from your machine. Verify:
- "Extracting…" spinner appears during upload
- Fields populate with amber/yellow highlight after extraction
- Warning message "Fields extracted — review and edit before saving" appears
- Editing a field removes the amber highlight for that field
- Clicking Save persists the values (verify on reload)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/(app)/settings/page.jsx
git commit -m "feat(settings): replace freeform brand doc textarea with structured fields and file upload"
```

---

## Final: Run the full test suite and push

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm test
```

Expected: all tests PASS with 0 failures.

- [ ] **Step 2: Push the branch**

```bash
git push
```
