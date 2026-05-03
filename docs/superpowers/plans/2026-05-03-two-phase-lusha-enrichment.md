# Two-Phase Lusha Lead Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Lusha integration from auto-enrich-all into a two-phase system where `/contact/search` (free) runs first and `/contact/enrich` (paid, credits consumed) runs only on user-selected leads.

**Architecture:** Phase 1 calls only `/prospecting/contact/search`, stores basic lead info (name, title, company), runs Gemini scoring, and parks the campaign at `AWAITING_LEAD_SELECTION`. Phase 2 is user-triggered via two new endpoints — `select-leads` (marks intent) and `unlock-leads` (enriches + deducts credits atomically) — after which the campaign moves to the existing `AWAITING_LEAD_APPROVAL` gate where email generation continues unchanged.

**Tech Stack:** Prisma (PostgreSQL), Express, Zod, Jest, pg-boss workers, Lusha REST API, Gemini AI

---

## File Map

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `AWAITING_LEAD_SELECTION` to `CampaignStatus`; add `credits Int @default(100)` to `User`; add `isEnriched`, `isSelected`, `lushaRequestId` to `Lead` |
| `backend/prisma/migrations/` | Auto-generated via `prisma migrate dev` |
| `backend/services/lusha.js` | Replace `searchLeads` with `searchLeadsBasic` (search only) and `enrichLeads` (enrich only) |
| `backend/workers/fetchLeads.js` | Use `lusha.searchLeadsBasic`, store unenriched leads, set `AWAITING_LEAD_SELECTION` |
| `backend/routes/campaigns.js` | Add `POST /:id/select-leads` and `POST /:id/unlock-leads`; update `approve-leads` to filter `isEnriched` leads |
| `backend/tests/services/lusha.test.js` | Replace combined `searchLeads` test with separate `searchLeadsBasic` and `enrichLeads` tests |
| `backend/tests/workers/fetchLeads.test.js` | Update mocks/assertions for Phase 1: no email on leads, status `AWAITING_LEAD_SELECTION` |
| `backend/tests/routes/campaigns.test.js` | Add tests for `select-leads` and `unlock-leads`; update `approve-leads` setup to create `isEnriched` leads |

---

## Task 1: Schema Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Run: `npx prisma migrate dev`

- [ ] **Step 1: Add `AWAITING_LEAD_SELECTION` to `CampaignStatus` and three fields to `Lead`**

Replace the `CampaignStatus` enum and `Lead` model in `backend/prisma/schema.prisma`:

```prisma
enum CampaignStatus {
  DRAFT
  RUNNING
  AWAITING_LEAD_SELECTION
  AWAITING_LEAD_APPROVAL
  AWAITING_EMAIL_APPROVAL
  PAUSED
  COMPLETED
}
```

Add `credits` to `User`:

```prisma
model User {
  id                String     @id @default(cuid())
  email             String     @unique
  name              String?
  password          String
  role              Role       @default(VIEWER)
  credits           Int        @default(100)
  campaigns         Campaign[]
  uploadedBrandDocs BrandDoc[]
  createdAt         DateTime   @default(now())
}
```

Add three fields to the bottom of `Lead` (before `createdAt`):

```prisma
model Lead {
  id             String     @id @default(cuid())
  lushaPersonId  String?    @unique
  lushaRequestId String?
  firstName      String
  lastName       String
  email          String?
  phone          String?
  title          String?
  company        String?
  location       String?
  linkedinUrl    String?
  department     String?
  seniority      String?
  isEnriched     Boolean    @default(false)
  isSelected     Boolean    @default(false)
  status         LeadStatus @default(NEW)
  fitScore       Int?
  fitReasoning   Json?
  campaign       Campaign   @relation(fields: [campaignId], references: [id])
  campaignId     String
  emails         Email[]
  replies        Reply[]
  createdAt      DateTime   @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npx prisma migrate dev --name two-phase-enrichment
```

Expected output ends with:
```
✔ Generated Prisma Client
```

- [ ] **Step 3: Verify migration applied**

```bash
cd backend && npx prisma studio
```

Open `Lead` table in the browser — confirm `isEnriched`, `isSelected`, `lushaRequestId` columns exist with correct defaults.
Ctrl-C to close Prisma Studio.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(schema): add two-phase enrichment fields and AWAITING_LEAD_SELECTION status"
```

---

## Task 2: Split Lusha Service

**Files:**
- Modify: `backend/services/lusha.js`
- Modify: `backend/tests/services/lusha.test.js`

- [ ] **Step 1: Write failing tests for the two new functions**

Replace the entire contents of `backend/tests/services/lusha.test.js`:

```js
import { jest } from "@jest/globals";
import { searchLeadsBasic, enrichLeads } from "../../services/lusha.js";

function makeFetch(responses) {
  const calls = [];
  const fn = jest.fn().mockImplementation(async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body
    };
  });
  fn.calls = calls;
  return fn;
}

const SEARCH_RESPONSE = {
  requestId: "req-123",
  currentPage: 0,
  totalResults: 1,
  data: [
    {
      contactId: "contact-uuid-1",
      name: "Alice Smith",
      jobTitle: "Head of Engineering",
      companyName: "Acme"
    }
  ]
};

const ENRICH_RESPONSE = {
  requestId: "req-123",
  contacts: [
    {
      id: "contact-uuid-1",
      isSuccess: true,
      error: null,
      data: {
        firstName: "Alice",
        lastName: "Smith",
        jobTitle: "Head of Engineering",
        companyName: "Acme",
        location: { country: "India" },
        emailAddresses: [{ email: "alice@acme.com", emailType: "work" }],
        phoneNumbers: [{ number: "+911234567890" }],
        socialLinks: { linkedin: "https://linkedin.com/in/alice" },
        departments: ["Engineering & Technical"],
        seniority: [{ name: "director" }]
      }
    }
  ]
};

describe("searchLeadsBasic", () => {
  test("calls only /contact/search, returns normalized basic leads with requestId", async () => {
    const fetch = makeFetch([{ status: 200, body: SEARCH_RESPONSE }]);

    const result = await searchLeadsBasic(
      { seniorities: ["director"], departments: ["Engineering & Technical"], locations: ["India"] },
      { fetch }
    );

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toMatch(/contact\/search/);

    expect(result).toHaveLength(1);
    expect(result[0].lushaContactId).toBe("contact-uuid-1");
    expect(result[0].firstName).toBe("Alice");
    expect(result[0].lastName).toBe("Smith");
    expect(result[0].title).toBe("Head of Engineering");
    expect(result[0].company).toBe("Acme");
    expect(result[0].requestId).toBe("req-123");
    // No email or phone — not enriched yet
    expect(result[0].email).toBeUndefined();
    expect(result[0].phone).toBeUndefined();
  });

  test("returns empty array when search returns no contacts", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [], totalResults: 0 } }]);
    const result = await searchLeadsBasic({ departments: ["Engineering & Technical"] }, { fetch });
    expect(result).toEqual([]);
    expect(fetch.calls).toHaveLength(1);
  });

  test("maps seniority strings to Lusha IDs in the search body", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [] } }]);
    await searchLeadsBasic(
      { seniorities: ["director", "c-suite", "manager"], locations: ["India"] },
      { fetch }
    );
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.contacts.include.seniority).toEqual(expect.arrayContaining([6, 9, 5]));
  });

  test("maps companySizes to Lusha size ranges", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [] } }]);
    await searchLeadsBasic(
      { departments: ["Engineering & Technical"], companySizes: ["51-200", "201-500"] },
      { fetch }
    );
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.companies.include.sizes).toEqual(
      expect.arrayContaining([{ min: 51, max: 200 }, { min: 201, max: 500 }])
    );
  });

  test("always includes work_email in existing_data_points", async () => {
    const fetch = makeFetch([{ status: 200, body: { requestId: "r", data: [] } }]);
    await searchLeadsBasic({ departments: ["Engineering & Technical"] }, { fetch });
    const searchBody = JSON.parse(fetch.calls[0].init.body);
    expect(searchBody.filters.contacts.include.existing_data_points).toContain("work_email");
  });

  test("retries on 429 with backoff", async () => {
    const fetch = makeFetch([
      { status: 429, body: { error: "rate_limited" } },
      { status: 200, body: { requestId: "r", data: [] } }
    ]);
    const result = await searchLeadsBasic({ departments: ["Engineering & Technical"] }, { fetch, retryDelayMs: 1 });
    expect(result).toEqual([]);
    expect(fetch.calls).toHaveLength(2);
  });

  test("throws on non-429 search failure", async () => {
    const fetch = makeFetch([{ status: 403, body: { message: "forbidden" } }]);
    await expect(searchLeadsBasic({ departments: ["Engineering & Technical"] }, { fetch }))
      .rejects.toThrow(/lusha_search_failed_403/);
  });
});

describe("enrichLeads", () => {
  test("calls /contact/enrich with requestId and contactIds, returns normalized enriched leads", async () => {
    const fetch = makeFetch([{ status: 200, body: ENRICH_RESPONSE }]);

    const result = await enrichLeads("req-123", ["contact-uuid-1"], { fetch });

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toMatch(/contact\/enrich/);

    const body = JSON.parse(fetch.calls[0].init.body);
    expect(body.requestId).toBe("req-123");
    expect(body.contactIds).toContain("contact-uuid-1");

    expect(result).toHaveLength(1);
    expect(result[0].lushaContactId).toBe("contact-uuid-1");
    expect(result[0].email).toBe("alice@acme.com");
    expect(result[0].phone).toBe("+911234567890");
    expect(result[0].linkedinUrl).toBe("https://linkedin.com/in/alice");
    expect(result[0].location).toBe("India");
    expect(result[0].department).toBe("Engineering & Technical");
    expect(result[0].seniority).toBe("director");
  });

  test("filters out contacts where isSuccess is false", async () => {
    const fetch = makeFetch([{
      status: 200,
      body: {
        contacts: [
          { id: "c1", isSuccess: true, data: { firstName: "Alice", lastName: "Smith", jobTitle: "CTO", companyName: "Acme", emailAddresses: [{ email: "a@acme.com", emailType: "work" }] } },
          { id: "c2", isSuccess: false, data: {} }
        ]
      }
    }]);

    const result = await enrichLeads("req-x", ["c1", "c2"], { fetch });
    expect(result).toHaveLength(1);
    expect(result[0].lushaContactId).toBe("c1");
  });

  test("returns empty array when all contacts fail enrichment", async () => {
    const fetch = makeFetch([{
      status: 200,
      body: { contacts: [{ id: "c1", isSuccess: false, data: {} }] }
    }]);
    const result = await enrichLeads("req-x", ["c1"], { fetch });
    expect(result).toEqual([]);
  });

  test("throws on enrich API failure", async () => {
    const fetch = makeFetch([{ status: 402, body: { message: "insufficient credits" } }]);
    await expect(enrichLeads("req-x", ["c1"], { fetch }))
      .rejects.toThrow(/lusha_enrich_failed_402/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
cd backend && npx jest tests/services/lusha.test.js --no-coverage
```

Expected: all tests **FAIL** with `searchLeadsBasic is not a function` / `enrichLeads is not a function`.

- [ ] **Step 3: Refactor `backend/services/lusha.js`**

Replace the entire file:

```js
import { env } from "../config/env.js";

const BASE = "https://api.lusha.com";

function headers() {
  return {
    "Content-Type": "application/json",
    "api_key": env.LUSHA_API_KEY || "test-key"
  };
}

async function requestWithRetry(url, init, { retries = 3, retryDelayMs = 1000, fetch: fetchFn = globalThis.fetch } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchFn(url, init);
    if (res.status !== 429) return res;
    if (attempt === retries) return res;
    const wait = retryDelayMs * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, wait));
  }
}

const SENIORITY_IDS = {
  "founder": 10, "partner": 7,
  "c-suite": 9, "c suite": 9, "csuite": 9, "c-level": 9, "c level": 9, "executive": 9,
  "vice president": 8, "vp": 8,
  "director": 6,
  "manager": 5,
  "senior": 4,
  "entry": 3,
  "intern": 2,
  "other": 1
};

const SIZE_RANGES = {
  "1-10": { min: 1, max: 10 },
  "11-50": { min: 11, max: 50 },
  "51-200": { min: 51, max: 200 },
  "201-500": { min: 201, max: 500 },
  "501-1000": { min: 501, max: 1000 },
  "1001-5000": { min: 1001, max: 5000 },
  "5001-10000": { min: 5001, max: 10000 },
  "10001+": { min: 10001 },
  "startup": { min: 1, max: 200 },
  "small": { min: 1, max: 200 },
  "medium": { min: 201, max: 1000 },
  "large": { min: 1001, max: 10000 },
  "enterprise": { min: 10001 },
  "unicorn": { min: 1001, max: 10000 }
};

function buildLushaBody(geminiFilters, page = 0, size = 25) {
  const contactsInclude = {};
  const companiesInclude = {};

  if (geminiFilters.departments?.length) {
    contactsInclude.departments = geminiFilters.departments;
  }

  if (geminiFilters.seniorities?.length) {
    const ids = [...new Set(
      geminiFilters.seniorities
        .map(s => SENIORITY_IDS[s.toLowerCase()])
        .filter(Boolean)
    )];
    if (ids.length) contactsInclude.seniority = ids;
  }

  if (geminiFilters.locations?.length) {
    contactsInclude.locations = geminiFilters.locations.map(l => ({ country: l }));
    companiesInclude.locations = geminiFilters.locations.map(l => ({ country: l }));
  }

  contactsInclude.existing_data_points = ["work_email"];

  if (geminiFilters.companySizes?.length) {
    const sizes = geminiFilters.companySizes
      .map(s => SIZE_RANGES[s.toLowerCase()] || null)
      .filter(Boolean);
    if (sizes.length) companiesInclude.sizes = sizes;
  }

  return {
    pages: { page, size },
    filters: {
      contacts: { include: contactsInclude },
      companies: { include: companiesInclude }
    }
  };
}

function normalizeName(fullName = "") {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || ""
  };
}

function normalizeEnriched(contact) {
  const d = contact.data || {};
  const emailEntry = (d.emailAddresses || []).find(e => e.emailType === "work") || d.emailAddresses?.[0];
  return {
    lushaContactId: contact.id,
    firstName: d.firstName || "",
    lastName: d.lastName || "",
    email: emailEntry?.email || null,
    phone: d.phoneNumbers?.[0]?.number || null,
    title: d.jobTitle || null,
    company: d.companyName || null,
    location: d.location?.country || null,
    linkedinUrl: d.socialLinks?.linkedin || null,
    department: d.departments?.[0] || null,
    seniority: d.seniority?.[0]?.name || null
  };
}

/**
 * Phase 1 — free. Calls /contact/search only.
 * Returns basic lead info + requestId (needed for later enrichment).
 * No credits consumed.
 */
export async function searchLeadsBasic(geminiFilters, opts = {}) {
  const body = buildLushaBody(geminiFilters, 0, 25);

  const res = await requestWithRetry(`${BASE}/prospecting/contact/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  }, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`lusha_search_failed_${res.status}: ${err.message || ""}`);
  }

  const json = await res.json();
  const requestId = json.requestId;
  const rawContacts = json.data || [];

  return rawContacts.map(c => {
    const { firstName, lastName } = normalizeName(c.name);
    return {
      lushaContactId: c.contactId,
      firstName,
      lastName,
      title: c.jobTitle || null,
      company: c.companyName || null,
      requestId
    };
  });
}

/**
 * Phase 2 — paid. Calls /contact/enrich for the given contactIds.
 * Credits are consumed by the Lusha API at this point.
 * requestId must be the one returned by the search that found these contacts.
 */
export async function enrichLeads(requestId, contactIds, opts = {}) {
  const res = await requestWithRetry(`${BASE}/prospecting/contact/enrich`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ requestId, contactIds })
  }, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`lusha_enrich_failed_${res.status}: ${err.message || ""}`);
  }

  const json = await res.json();
  const enriched = (json.contacts || []).filter(c => c.isSuccess);
  return enriched.map(normalizeEnriched);
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd backend && npx jest tests/services/lusha.test.js --no-coverage
```

Expected: all tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/services/lusha.js backend/tests/services/lusha.test.js
git commit -m "feat(lusha): split searchLeads into searchLeadsBasic (free) and enrichLeads (paid)"
```

---

## Task 3: Update fetchLeads Worker

**Files:**
- Modify: `backend/workers/fetchLeads.js`
- Modify: `backend/tests/workers/fetchLeads.test.js`

- [ ] **Step 1: Write failing tests for Phase 1 worker behavior**

Replace the entire contents of `backend/tests/workers/fetchLeads.test.js`:

```js
import { jest } from "@jest/globals";
import { runFetchLeadsJob, __setLushaImpl, __setScoringImpl } from "../../workers/fetchLeads.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

beforeEach(async () => {
  await resetDb();
  __setScoringImpl({ scoreLeads: jest.fn().mockResolvedValue([]) });
});

describe("fetchLeads worker (Phase 1 — basic only)", () => {
  test("stores basic leads without email and sets AWAITING_LEAD_SELECTION", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-1", firstName: "A", lastName: "B", title: "CTO", company: "Acme", requestId: "req-1" },
        { lushaContactId: "uuid-2", firstName: "C", lastName: "D", title: "VP Eng", company: "Beta", requestId: "req-1" }
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
    // No email or phone — unenriched
    expect(leads.every(l => l.email === null)).toBe(true);
    expect(leads.every(l => l.phone === null)).toBe(true);
    expect(leads.every(l => l.isEnriched === false)).toBe(true);
    expect(leads.every(l => l.lushaRequestId === "req-1")).toBe(true);
    expect(leads.map(l => l.lushaPersonId)).toEqual(expect.arrayContaining(["uuid-1", "uuid-2"]));

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_SELECTION");
  });

  test("zero leads from Lusha → campaign COMPLETED", async () => {
    __setLushaImpl({ searchLeadsBasic: jest.fn().mockResolvedValue([]) });

    const { user } = await createUser({ role: "MANAGER", email: `u2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    await runFetchLeadsJob({ data: { campaignId: campaign.id } });
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  test("persists fitScore and fitReasoning from scoring service", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-3", firstName: "E", lastName: "F", title: "CTO", company: "Gamma", requestId: "req-2" }
      ])
    });
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

  test("scoring failure does not block AWAITING_LEAD_SELECTION", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-5", firstName: "I", lastName: "J", title: "CTO", company: "Epsilon", requestId: "req-3" }
      ])
    });
    __setScoringImpl({ scoreLeads: jest.fn().mockRejectedValue(new Error("Gemini timeout")) });

    const { user } = await createUser({ role: "MANAGER", email: `u5${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_SELECTION");

    const [lead] = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(lead.fitScore).toBeNull();
  });

  test("no scores returned does not block AWAITING_LEAD_SELECTION", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-4", firstName: "G", lastName: "H", title: "CTO", company: "Delta", requestId: "req-4" }
      ])
    });
    __setScoringImpl({ scoreLeads: jest.fn().mockResolvedValue([]) });

    const { user } = await createUser({ role: "MANAGER", email: `u4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_SELECTION");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/workers/fetchLeads.test.js --no-coverage
```

Expected: **FAIL** — `searchLeadsBasic is not a function`, status is `AWAITING_LEAD_APPROVAL` not `AWAITING_LEAD_SELECTION`.

- [ ] **Step 3: Rewrite `backend/workers/fetchLeads.js`**

Replace the entire file:

```js
import { prisma } from "../lib/prisma.js";
import { searchLeadsBasic as realSearchLeadsBasic } from "../services/lusha.js";
import { scoreLeads as realScoreLeads } from "../services/leadScoring.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "fetch-leads";

let lusha = { searchLeadsBasic: realSearchLeadsBasic };
export function __setLushaImpl(impl) { lusha = impl; }

let scorer = { scoreLeads: realScoreLeads };
export function __setScoringImpl(impl) { scorer = impl; }

export async function runFetchLeadsJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  const results = await lusha.searchLeadsBasic(campaign.extractedFilters);
  logger.info(`fetch-leads: ${results.length} basic leads for campaign ${campaignId}`);

  if (results.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    return { leadCount: 0 };
  }

  const upsertedLeads = [];
  for (const r of results) {
    const personId = r.lushaContactId ?? `${campaignId}-unknown-${Date.now()}`;
    const lead = await prisma.lead.upsert({
      where: { lushaPersonId: personId },
      update: {},
      create: {
        lushaPersonId: personId,
        lushaRequestId: r.requestId,
        firstName: r.firstName,
        lastName: r.lastName,
        title: r.title,
        company: r.company,
        isEnriched: false,
        campaignId
      }
    });
    upsertedLeads.push(lead);
  }

  let scores = [];
  try {
    scores = await scorer.scoreLeads(campaign.rawGoal, upsertedLeads);
  } catch {
    logger.warn(`fetch-leads: scoring threw for campaign ${campaignId}, continuing without scores`);
  }
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

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "AWAITING_LEAD_SELECTION" } });
  logger.info(`fetch-leads: campaign ${campaignId} awaiting lead selection (${upsertedLeads.length} leads)`);
  return { leadCount: upsertedLeads.length };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runFetchLeadsJob);
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd backend && npx jest tests/workers/fetchLeads.test.js --no-coverage
```

Expected: all tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/workers/fetchLeads.js backend/tests/workers/fetchLeads.test.js
git commit -m "feat(worker): fetch-leads now stores basic unenriched leads and sets AWAITING_LEAD_SELECTION"
```

---

## Task 4: Add `select-leads` Route

**Files:**
- Modify: `backend/routes/campaigns.js`
- Modify: `backend/tests/routes/campaigns.test.js`

- [ ] **Step 1: Write failing tests**

Add the following describe block to `backend/tests/routes/campaigns.test.js` (after the `approval gates` describe block):

```js
describe("select-leads", () => {
  test("POST /select-leads marks given leads as selected", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({ data: { firstName: "A", lastName: "B", company: "X", campaignId: campaign.id } }),
      prisma.lead.create({ data: { firstName: "C", lastName: "D", company: "Y", campaignId: campaign.id } })
    ]);

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [lead1.id] });

    expect(res.status).toBe(200);
    expect(res.body.selected).toBe(1);
    expect(res.body.deselected).toBe(1);

    const updated1 = await prisma.lead.findUnique({ where: { id: lead1.id } });
    expect(updated1.isSelected).toBe(true);

    const updated2 = await prisma.lead.findUnique({ where: { id: lead2.id } });
    expect(updated2.isSelected).toBe(false);
  });

  test("returns 409 if campaign not in AWAITING_LEAD_SELECTION", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_status");
  });

  test("returns 404 for unknown campaign", async () => {
    const { token } = await createUser({ role: "MANAGER", email: `sl3${Date.now()}@x.com` });
    const res = await request(app)
      .post("/api/campaigns/nonexistent-id/select-leads")
      .set(authHeader(token))
      .send({ leadIds: [] });
    expect(res.status).toBe(404);
  });

  test("returns 400 for invalid body", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: "not-an-array" });
    expect(res.status).toBe(400);
  });

  test("select-leads ignores lead IDs that don't belong to the campaign", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl5${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const otherUser = await createUser({ role: "MANAGER", email: `sl5b${Date.now()}@x.com` });
    const otherCampaign = await prisma.campaign.create({
      data: { name: "Other", rawGoal: "goal", extractedFilters: {}, createdById: otherUser.user.id }
    });
    const foreignLead = await prisma.lead.create({
      data: { firstName: "X", lastName: "Y", company: "Z", campaignId: otherCampaign.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [foreignLead.id] });

    expect(res.status).toBe(200);
    expect(res.body.selected).toBe(0);

    const foreignUpdated = await prisma.lead.findUnique({ where: { id: foreignLead.id } });
    expect(foreignUpdated.isSelected).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage -t "select-leads"
```

Expected: **FAIL** — route does not exist yet (404).

- [ ] **Step 3: Add `select-leads` route to `backend/routes/campaigns.js`**

Add the following block before the `export default router;` line:

```js
const selectLeadsSchema = z.object({
  leadIds: z.array(z.string())
});

router.post("/:id/select-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_SELECTION") return res.status(409).json({ error: "invalid_status" });

    const parsed = selectLeadsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { leadIds } = parsed.data;

    // Only operate on leads that belong to this campaign
    const campaignLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id },
      select: { id: true }
    });
    const campaignLeadIds = new Set(campaignLeads.map(l => l.id));
    const validSelected = leadIds.filter(id => campaignLeadIds.has(id));
    const validDeselected = [...campaignLeadIds].filter(id => !validSelected.includes(id));

    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: { in: validSelected } },
        data: { isSelected: true }
      }),
      prisma.lead.updateMany({
        where: { id: { in: validDeselected } },
        data: { isSelected: false }
      })
    ]);

    res.json({ selected: validSelected.length, deselected: validDeselected.length });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage -t "select-leads"
```

Expected: all tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/campaigns.js backend/tests/routes/campaigns.test.js
git commit -m "feat(routes): add POST /campaigns/:id/select-leads endpoint"
```

---

## Task 5: Add `unlock-leads` Route

This is the credit-consuming step. Enriches selected leads atomically with credit deduction.

**Files:**
- Modify: `backend/routes/campaigns.js`
- Modify: `backend/tests/routes/campaigns.test.js`

- [ ] **Step 1: Wire injectable `enrichLeads` into the route file**

At the top of `backend/routes/campaigns.js`, add after the existing imports:

```js
import { enrichLeads as realEnrichLeads } from "../services/lusha.js";

let enrich = realEnrichLeads;
export function __setEnrichLeadsImpl(fn) { enrich = fn; }
```

- [ ] **Step 2: Write failing tests**

Add the following describe block to `backend/tests/routes/campaigns.test.js`:

```js
import { __setEnrichLeadsImpl } from "../../routes/campaigns.js";
```

Add this import to the top of the test file (after the existing imports), then add the describe block:

```js
describe("unlock-leads", () => {
  beforeEach(() => {
    // Default: enrich returns enriched data for any contactId
    __setEnrichLeadsImpl(jest.fn().mockImplementation(async (_reqId, contactIds) =>
      contactIds.map(id => ({
        lushaContactId: id,
        email: `${id}@enriched.com`,
        phone: "+911234567890",
        linkedinUrl: `https://linkedin.com/in/${id}`,
        location: "India",
        department: "Engineering & Technical",
        seniority: "director",
        firstName: "Enriched",
        lastName: "User",
        title: "CTO",
        company: "EnrichedCo"
      }))
    ));
  });

  test("enriches selected leads, deducts credits, moves campaign to AWAITING_LEAD_APPROVAL", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul${Date.now()}@x.com` });
    // Give user 10 credits
    await prisma.user.update({ where: { id: user.id }, data: { credits: 10 } });

    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({
        data: { firstName: "A", lastName: "B", company: "X", campaignId: campaign.id,
                lushaPersonId: "c-1", lushaRequestId: "req-abc", isSelected: true }
      }),
      prisma.lead.create({
        data: { firstName: "C", lastName: "D", company: "Y", campaignId: campaign.id,
                lushaPersonId: "c-2", lushaRequestId: "req-abc", isSelected: false }
      })
    ]);

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token))
      .send({ leadIds: [lead1.id] });

    expect(res.status).toBe(200);
    expect(res.body.enriched).toBe(1);
    expect(res.body.failed).toBe(0);

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead1.id } });
    expect(updatedLead.isEnriched).toBe(true);
    expect(updatedLead.email).toBe("c-1@enriched.com");
    expect(updatedLead.phone).toBe("+911234567890");

    const updatedCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updatedCampaign.status).toBe("AWAITING_LEAD_APPROVAL");

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.credits).toBe(9); // 1 credit consumed
  });

  test("returns 402 when user has insufficient credits", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul2${Date.now()}@x.com` });
    await prisma.user.update({ where: { id: user.id }, data: { credits: 0 } });

    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", company: "X", campaignId: campaign.id,
              lushaPersonId: "c-10", lushaRequestId: "req-x", isSelected: true }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token))
      .send({ leadIds: [lead.id] });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe("insufficient_credits");
    expect(res.body.required).toBe(1);
    expect(res.body.available).toBe(0);

    // Credits not deducted, lead not enriched
    const unchanged = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(unchanged.isEnriched).toBe(false);
  });

  test("skips already-enriched leads (no double-charge)", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul3${Date.now()}@x.com` });
    await prisma.user.update({ where: { id: user.id }, data: { credits: 10 } });

    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const alreadyEnriched = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", company: "X", email: "already@x.com", campaignId: campaign.id,
              lushaPersonId: "c-20", lushaRequestId: "req-y", isEnriched: true, isSelected: true }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token))
      .send({ leadIds: [alreadyEnriched.id] });

    expect(res.status).toBe(200);
    expect(res.body.enriched).toBe(0);
    expect(res.body.skipped).toBe(1);

    // No credits deducted
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.credits).toBe(10);

    // Campaign still moves to AWAITING_LEAD_APPROVAL (there are enriched leads)
    const updatedCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updatedCampaign.status).toBe("AWAITING_LEAD_APPROVAL");
  });

  test("returns 409 if campaign not in AWAITING_LEAD_SELECTION", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token))
      .send({ leadIds: [] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_status");
  });

  test("returns 400 when leadIds is empty and no pre-enriched leads exist", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul5${Date.now()}@x.com` });
    await prisma.user.update({ where: { id: user.id }, data: { credits: 10 } });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token))
      .send({ leadIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_leads_to_unlock");
  });
});
```

Also update the import block at the top of the test file to include the new injectable:

The current imports look like:
```js
import { __setExtractFilters } from "../../routes/campaigns.js";
```

Change to:
```js
import { __setExtractFilters, __setEnrichLeadsImpl } from "../../routes/campaigns.js";
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage -t "unlock-leads"
```

Expected: **FAIL** — route doesn't exist.

- [ ] **Step 4: Add `unlock-leads` route to `backend/routes/campaigns.js`**

Add the following block before the `export default router;` line (after `select-leads`):

```js
const unlockLeadsSchema = z.object({
  leadIds: z.array(z.string())
});

router.post("/:id/unlock-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_SELECTION") return res.status(409).json({ error: "invalid_status" });

    const parsed = unlockLeadsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { leadIds } = parsed.data;

    // Fetch the target leads — only those that belong to this campaign
    const campaignLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id, id: { in: leadIds } }
    });

    // Separate already-enriched (skip) from needs-enrichment
    const alreadyEnriched = campaignLeads.filter(l => l.isEnriched);
    const toEnrich = campaignLeads.filter(l => !l.isEnriched && l.lushaPersonId && l.lushaRequestId);

    if (toEnrich.length === 0 && alreadyEnriched.length === 0) {
      return res.status(400).json({ error: "no_leads_to_unlock" });
    }

    // Check user has enough credits for the un-enriched leads
    const currentUser = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (currentUser.credits < toEnrich.length) {
      return res.status(402).json({
        error: "insufficient_credits",
        required: toEnrich.length,
        available: currentUser.credits
      });
    }

    let enrichedCount = 0;
    let failedCount = 0;

    if (toEnrich.length > 0) {
      // All leads in one campaign run share a requestId — use the first
      const requestId = toEnrich[0].lushaRequestId;
      const contactIds = toEnrich.map(l => l.lushaPersonId);

      let enrichedData;
      try {
        enrichedData = await enrich(requestId, contactIds);
      } catch (err) {
        return next(err);
      }

      // Build a lookup map for enriched data
      const enrichedMap = new Map(enrichedData.map(e => [e.lushaContactId, e]));

      // Atomic transaction: update leads + deduct credits
      await prisma.$transaction(async (tx) => {
        for (const lead of toEnrich) {
          const data = enrichedMap.get(lead.lushaPersonId);
          if (data) {
            await tx.lead.update({
              where: { id: lead.id },
              data: {
                email: data.email,
                phone: data.phone,
                linkedinUrl: data.linkedinUrl,
                location: data.location,
                department: data.department,
                seniority: data.seniority,
                isEnriched: true
              }
            });
            enrichedCount++;
          } else {
            failedCount++;
          }
        }
        await tx.user.update({
          where: { id: req.user.sub },
          data: { credits: { decrement: enrichedCount } }
        });
      });
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "AWAITING_LEAD_APPROVAL" }
    });

    res.json({
      enriched: enrichedCount,
      failed: failedCount,
      skipped: alreadyEnriched.length
    });
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Run tests — all should pass**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage -t "unlock-leads"
```

Expected: all tests **PASS**.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/campaigns.js backend/tests/routes/campaigns.test.js
git commit -m "feat(routes): add POST /campaigns/:id/unlock-leads with atomic credit deduction"
```

---

## Task 6: Update `approve-leads` Route

The existing `approve-leads` route filters `email: { not: null }`. After Phase 2 enrichment, leads with emails are those with `isEnriched: true`. Update the filter so the route works correctly in the new world.

**Files:**
- Modify: `backend/routes/campaigns.js`
- Modify: `backend/tests/routes/campaigns.test.js`

- [ ] **Step 1: Update existing `approve-leads` tests to create enriched leads**

Find the `approval gates` describe block in `backend/tests/routes/campaigns.test.js`.

Update the test `"POST /approve-leads enqueues generate-email and sets RUNNING"` — change the `lead.createMany` to include `isEnriched: true` and `email` on the leads:

```js
test("POST /approve-leads enqueues generate-email and sets RUNNING", async () => {
  const { user, token } = await createUser({ role: "MANAGER", email: `al${Date.now()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
  });
  await prisma.lead.createMany({
    data: [
      { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id, isEnriched: true },
      { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id, isEnriched: true }
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
```

Also update the `"POST /approve-leads with approvedIds only enqueues approved leads"` test to add `isEnriched: true`:

```js
test("POST /approve-leads with approvedIds only enqueues approved leads", async () => {
  const { user, token } = await createUser({ role: "MANAGER", email: `alidx${Date.now()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
  });
  const [lead1, lead2] = await Promise.all([
    prisma.lead.create({ data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id, isEnriched: true } }),
    prisma.lead.create({ data: { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id, isEnriched: true } })
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
```

Also update `"POST /approve-leads returns 409 when all leads are skipped via approvedIds"` and `"POST /approve-leads with approvedIds skips pre-SKIPPED leads"` similarly to add `isEnriched: true` and `email` to created leads.

- [ ] **Step 2: Run full approval tests to confirm they still pass**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage -t "approval gates"
```

Expected: all **PASS** (the existing logic already filters by `email: { not: null }`, so enriched leads with emails still work).

- [ ] **Step 3: Update the `approve-leads` route to also filter by `isEnriched`**

In `backend/routes/campaigns.js`, find the `approve-leads` route handler. Find this line:

```js
const allLeads = await prisma.lead.findMany({
  where: { campaignId: campaign.id, email: { not: null } }
});
```

Change it to:

```js
const allLeads = await prisma.lead.findMany({
  where: { campaignId: campaign.id, isEnriched: true, email: { not: null } }
});
```

- [ ] **Step 4: Run all campaign route tests to confirm nothing regressed**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage
```

Expected: all tests **PASS**.

- [ ] **Step 5: Run the full test suite**

```bash
cd backend && npm test
```

Expected: all tests **PASS** (or pre-existing failures only — none introduced by this change).

- [ ] **Step 6: Commit**

```bash
git add backend/routes/campaigns.js backend/tests/routes/campaigns.test.js
git commit -m "feat(routes): approve-leads now filters isEnriched leads; complete two-phase enrichment refactor"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Split `searchLeads` into `searchLeadsBasic` + `enrichLeads` | Task 2 |
| `isEnriched`, `isSelected`, `lushaRequestId` on Lead | Task 1 |
| `credits` on User | Task 1 |
| `AWAITING_LEAD_SELECTION` status | Task 1 |
| `fetchLeads` worker uses basic search only | Task 3 |
| Scoring runs before enrichment | Task 3 (unchanged scoring service, runs on basic leads) |
| `POST /select-leads` endpoint | Task 4 |
| `POST /unlock-leads` endpoint | Task 5 |
| Credit check before enrichment | Task 5, Step 4 — `402` if insufficient |
| Atomic credit deduction + enrichment | Task 5, Step 4 — `prisma.$transaction` |
| No double-charge for already-enriched leads | Task 5, `alreadyEnriched` filter + test |
| Campaign moves to `AWAITING_LEAD_APPROVAL` after unlock | Task 5 |
| `approve-leads` filters enriched leads | Task 6 |
| Partial enrichment failures handled | Task 5 — `failedCount` tracked; transaction only counts successful enrichments |
| Leads without email/phone after enrichment | Task 5 — `enrichedMap.get` returns null → `failedCount++`, not crashed |

### Edge Cases Verified

- **Insufficient credits** → 402 response, no DB changes (Task 5 test 2)
- **Duplicate unlock** (already enriched leads in `leadIds`) → skipped, no extra charges (Task 5 test 3)
- **Foreign lead IDs in select-leads** → silently ignored, foreign lead unchanged (Task 4 test 5)
- **Empty leadIds with no pre-enriched leads** → 400 (Task 5 test 5)
- **Enrich API failure** → propagated as 500 via `next(err)`, transaction never committed
- **Scoring failure** → logged, continues to `AWAITING_LEAD_SELECTION` (Task 3 test 4)
