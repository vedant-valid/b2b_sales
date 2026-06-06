# Multi-Sender Campaign Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to sync email accounts from Instantly, assign them to users, and have each user pick their sending email when creating a campaign.

**Architecture:** A new `SenderAccount` table mirrors Instantly's email accounts (synced on demand). A `UserSenderAccount` join table assigns senders to users. `Campaign.senderEmail` stores the chosen sender; the dispatch worker uses it over the env-var fallback.

**Tech Stack:** Prisma (PostgreSQL), Express, Zod, React/Next.js 15, NextAuth, Tailwind, Instantly API v2

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/prisma/schema.prisma` | Modify | Add `SenderAccount`, `UserSenderAccount`, `Campaign.senderEmail`, `User.senderAccounts` |
| `backend/services/instantly.js` | Modify | Add `listSendingAccounts()` |
| `backend/routes/senderAccounts.js` | Create | All 5 sender-account endpoints |
| `backend/app.js` | Modify | Register senderAccounts router |
| `backend/workers/dispatchCampaign.js` | Modify | Use `campaign.senderEmail` with env-var fallback |
| `backend/tests/routes/senderAccounts.test.js` | Create | Route tests |
| `backend/tests/services/instantly.senderAccounts.test.js` | Create | `listSendingAccounts` unit test |
| `frontend/src/app/(app)/settings/senders/page.jsx` | Create | Admin senders management page |
| `frontend/src/components/Sidebar.jsx` | Modify | Add Senders nav link (admin only) |
| `frontend/src/components/CampaignWizard.jsx` | Modify | Add sender selection dropdown |

---

## Task 1: Prisma schema — add SenderAccount, UserSenderAccount, Campaign.senderEmail

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add models and fields to schema.prisma**

Open `backend/prisma/schema.prisma`. Add the two new models at the bottom, and add the two new fields to existing models:

In the `User` model, add:
```prisma
senderAccounts    UserSenderAccount[]
```

In the `Campaign` model, add:
```prisma
senderEmail         String?
```

Add at the bottom of the file:
```prisma
model SenderAccount {
  accountId    String              @id
  email        String              @unique
  status       String?
  syncedAt     DateTime            @default(now()) @updatedAt
  assignments  UserSenderAccount[]
}

model UserSenderAccount {
  userId      String
  senderEmail String
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  sender      SenderAccount @relation(fields: [senderEmail], references: [email], onDelete: Cascade)
  assignedAt  DateTime      @default(now())

  @@id([userId, senderEmail])
}
```

- [ ] **Step 2: Run migration and generate client**

```bash
cd backend && npx prisma migrate dev --name add_sender_accounts && npx prisma generate
```

Expected output: `✔ Generated Prisma Client` with no errors. A new file appears under `backend/prisma/migrations/`.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add SenderAccount, UserSenderAccount, Campaign.senderEmail"
```

---

## Task 2: Instantly service — listSendingAccounts()

**Files:**
- Modify: `backend/services/instantly.js`
- Create: `backend/tests/services/instantly.senderAccounts.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/instantly.senderAccounts.test.js`:

```js
import { listSendingAccounts } from "../../services/instantly.js";

test("listSendingAccounts maps Instantly response to { accountId, email, status }", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      accounts: [
        { account_id: "acc_1", email: "alice@nstx.co.in", status: "active" },
        { account_id: "acc_2", email: "bob@nstx.co.in", status: "warming_up" }
      ]
    })
  });

  const result = await listSendingAccounts({ fetch: fakeFetch });

  expect(result).toHaveLength(2);
  expect(result[0]).toEqual({ accountId: "acc_1", email: "alice@nstx.co.in", status: "active" });
  expect(result[1]).toEqual({ accountId: "acc_2", email: "bob@nstx.co.in", status: "warming_up" });
});

test("listSendingAccounts handles empty accounts array", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ accounts: [] })
  });

  const result = await listSendingAccounts({ fetch: fakeFetch });
  expect(result).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && npx jest tests/services/instantly.senderAccounts.test.js --no-coverage
```

Expected: FAIL — `listSendingAccounts is not a function`

- [ ] **Step 3: Add listSendingAccounts to instantly.js**

At the bottom of `backend/services/instantly.js`, add:

```js
export async function listSendingAccounts(opts = {}) {
  const { fetch: fetchFn } = opts;
  const data = await req("/api/v2/accounts", "GET", null, { fetch: fetchFn });
  return (data.accounts || []).map(a => ({
    accountId: a.account_id,
    email: a.email,
    status: a.status ?? null
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/services/instantly.senderAccounts.test.js --no-coverage
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add backend/services/instantly.js backend/tests/services/instantly.senderAccounts.test.js
git commit -m "feat(instantly): add listSendingAccounts()"
```

---

## Task 3: Backend route — senderAccounts.js

**Files:**
- Create: `backend/routes/senderAccounts.js`
- Create: `backend/tests/routes/senderAccounts.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/routes/senderAccounts.test.js`:

```js
import request from "supertest";
import { jest } from "@jest/globals";
import { createApp } from "../../app.js";
import { __setListAccountsImpl } from "../../routes/senderAccounts.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { stopBoss } from "../../lib/pgboss.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  __setListAccountsImpl(async () => [
    { accountId: "acc_1", email: "alice@nstx.co.in", status: "active" },
    { accountId: "acc_2", email: "bob@nstx.co.in", status: "warming_up" }
  ]);
});

afterAll(async () => { await stopBoss(); });

describe("POST /api/sender-accounts/sync", () => {
  test("admin can sync accounts from Instantly", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .post("/api/sender-accounts/sync")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(2);
    expect(res.body.senders.map(s => s.email)).toContain("alice@nstx.co.in");
  });

  test("manager cannot sync", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "mgr@x.com" });
    const res = await request(app)
      .post("/api/sender-accounts/sync")
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("sync is idempotent — re-syncing updates existing records", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    const res = await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(2);
  });
});

describe("GET /api/sender-accounts", () => {
  test("admin sees all synced senders with assignments", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    const res = await request(app).get("/api/sender-accounts").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.senders).toHaveLength(2);
    expect(res.body.senders[0]).toHaveProperty("assignments");
  });
});

describe("POST /api/sender-accounts/:email/assign", () => {
  test("admin can assign a sender to a user", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const { user: target } = await createUser({ role: "MANAGER", email: "mgr2@x.com" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));

    const res = await request(app)
      .post("/api/sender-accounts/alice@nstx.co.in/assign")
      .set(authHeader(token))
      .send({ userId: target.id });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  test("returns 404 for unknown sender email", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const { user: target } = await createUser({ role: "MANAGER", email: "mgr3@x.com" });
    const res = await request(app)
      .post("/api/sender-accounts/nobody@x.com/assign")
      .set(authHeader(token))
      .send({ userId: target.id });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/sender-accounts/:email/assign/:userId", () => {
  test("admin can unassign a sender from a user", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const { user: target } = await createUser({ role: "MANAGER", email: "mgr4@x.com" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    await request(app)
      .post("/api/sender-accounts/alice@nstx.co.in/assign")
      .set(authHeader(token))
      .send({ userId: target.id });

    const res = await request(app)
      .delete(`/api/sender-accounts/alice@nstx.co.in/assign/${target.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);

    const mine = await request(app)
      .get("/api/sender-accounts/mine")
      .set(authHeader(await createUser({ role: "MANAGER", email: "mgr4@x.com" }).then(u => u.token)));
    // target user's senders should now be empty
    const assignment = await prisma.userSenderAccount.findFirst({ where: { userId: target.id } });
    expect(assignment).toBeNull();
  });
});

describe("GET /api/sender-accounts/mine", () => {
  test("returns only the current user's assigned senders", async () => {
    const { token: adminToken } = await createUser({ role: "ADMIN" });
    const { user: mgr, token: mgrToken } = await createUser({ role: "MANAGER", email: "mgr5@x.com" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(adminToken));
    await request(app)
      .post("/api/sender-accounts/alice@nstx.co.in/assign")
      .set(authHeader(adminToken))
      .send({ userId: mgr.id });

    const res = await request(app).get("/api/sender-accounts/mine").set(authHeader(mgrToken));
    expect(res.status).toBe(200);
    expect(res.body.senders).toHaveLength(1);
    expect(res.body.senders[0].email).toBe("alice@nstx.co.in");
  });

  test("returns empty array when user has no assigned senders", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "mgr6@x.com" });
    const res = await request(app).get("/api/sender-accounts/mine").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.senders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend && npx jest tests/routes/senderAccounts.test.js --no-coverage
```

Expected: FAIL — route file does not exist yet

- [ ] **Step 3: Create backend/routes/senderAccounts.js**

```js
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { listSendingAccounts as realListAccounts } from "../services/instantly.js";

const router = Router();
router.use(requireAuth);

let listAccountsFn = realListAccounts;
export function __setListAccountsImpl(impl) { listAccountsFn = impl; }

// IMPORTANT: /mine must be registered before /:email to avoid Express matching "mine" as an email param
router.get("/mine", async (req, res, next) => {
  try {
    const assignments = await prisma.userSenderAccount.findMany({
      where: { userId: req.user.id },
      include: { sender: true }
    });
    res.json({ senders: assignments.map(a => a.sender) });
  } catch (e) { next(e); }
});

router.post("/sync", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const accounts = await listAccountsFn();
    for (const a of accounts) {
      await prisma.senderAccount.upsert({
        where: { email: a.email },
        update: { status: a.status, syncedAt: new Date() },
        create: { accountId: a.accountId, email: a.email, status: a.status }
      });
    }
    const all = await prisma.senderAccount.findMany({ orderBy: { email: "asc" } });
    res.json({ synced: all.length, senders: all });
  } catch (e) { next(e); }
});

router.get("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const senders = await prisma.senderAccount.findMany({
      orderBy: { email: "asc" },
      include: {
        assignments: {
          include: { user: { select: { id: true, email: true, name: true } } }
        }
      }
    });
    res.json({ senders });
  } catch (e) { next(e); }
});

const assignSchema = z.object({ userId: z.string() });

router.post("/:email/assign", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const sender = await prisma.senderAccount.findUnique({ where: { email: req.params.email } });
    if (!sender) return res.status(404).json({ error: "not_found" });
    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return res.status(404).json({ error: "user_not_found" });
    await prisma.userSenderAccount.upsert({
      where: { userId_senderEmail: { userId: parsed.data.userId, senderEmail: req.params.email } },
      update: {},
      create: { userId: parsed.data.userId, senderEmail: req.params.email }
    });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

router.delete("/:email/assign/:userId", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.userSenderAccount.deleteMany({
      where: { userId: req.params.userId, senderEmail: req.params.email }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest tests/routes/senderAccounts.test.js --no-coverage
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add backend/routes/senderAccounts.js backend/tests/routes/senderAccounts.test.js
git commit -m "feat(backend): add sender accounts route with sync, assign, and mine endpoints"
```

---

## Task 4: Register route in app.js

**Files:**
- Modify: `backend/app.js`

- [ ] **Step 1: Add import and register route**

In `backend/app.js`, add the import at the top with the other router imports:

```js
import senderAccountsRouter from "./routes/senderAccounts.js";
```

Add the route registration before `app.use("/api/campaigns", campaignsRouter)`:

```js
app.use("/api/sender-accounts", senderAccountsRouter);
```

- [ ] **Step 2: Run full backend test suite to verify nothing broke**

```bash
cd backend && npm test -- --no-coverage
```

Expected: all tests pass (no regressions)

- [ ] **Step 3: Commit**

```bash
git add backend/app.js
git commit -m "feat(backend): register senderAccounts router"
```

---

## Task 5: Update dispatch worker to use campaign.senderEmail

**Files:**
- Modify: `backend/services/instantly.js`
- Modify: `backend/workers/dispatchCampaign.js`

- [ ] **Step 1: Write the failing test**

In `backend/tests/routes/` look for dispatch-related tests or add to the existing campaigns test. Create `backend/tests/workers/dispatchCampaign.senderEmail.test.js`:

```js
import { jest } from "@jest/globals";
import { prisma } from "../../lib/prisma.js";
import { runDispatchJob, __setInstantlyImpl } from "../../workers/dispatchCampaign.js";
import { createUser } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { stopBoss } from "../../lib/pgboss.js";

afterAll(async () => { await stopBoss(); });
beforeEach(resetDb);

test("dispatch uses campaign.senderEmail when set", async () => {
  const { user } = await createUser({ role: "MANAGER" });
  const campaign = await prisma.campaign.create({
    data: {
      name: "Test",
      rawGoal: "test",
      extractedFilters: {},
      createdById: user.id,
      senderEmail: "alice@nstx.co.in"
    }
  });
  await prisma.lead.create({
    data: {
      firstName: "John", lastName: "Doe", email: "john@acme.com",
      campaignId: campaign.id,
      emails: { create: { subject: "Hi", body: "Hello", status: "DRAFT" } }
    }
  });

  let capturedEmailList;
  __setInstantlyImpl({
    createCampaign: async (_name, opts) => {
      capturedEmailList = opts.senderEmails;
      return { instantlyCampaignId: "instantly_abc" };
    },
    pushLeads: async () => ({ accepted: 1, rejected: [] }),
    activateCampaign: async () => {}
  });

  await runDispatchJob({ data: { campaignId: campaign.id } });
  expect(capturedEmailList).toEqual(["alice@nstx.co.in"]);
});

test("dispatch falls back to env var when campaign.senderEmail is null", async () => {
  const { user } = await createUser({ role: "MANAGER", email: "mgr@x.com" });
  const campaign = await prisma.campaign.create({
    data: {
      name: "Old Campaign",
      rawGoal: "test",
      extractedFilters: {},
      createdById: user.id,
      senderEmail: null
    }
  });
  await prisma.lead.create({
    data: {
      firstName: "Jane", lastName: "Smith", email: "jane@acme.com",
      campaignId: campaign.id,
      emails: { create: { subject: "Hi", body: "Hello", status: "DRAFT" } }
    }
  });

  let capturedEmailList;
  __setInstantlyImpl({
    createCampaign: async (_name, opts) => {
      capturedEmailList = opts.senderEmails;
      return { instantlyCampaignId: "instantly_xyz" };
    },
    pushLeads: async () => ({ accepted: 1, rejected: [] }),
    activateCampaign: async () => {}
  });

  await runDispatchJob({ data: { campaignId: campaign.id } });
  // senderEmails is undefined when no campaign.senderEmail and no env var set in test
  expect(capturedEmailList).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend && npx jest tests/workers/dispatchCampaign.senderEmail.test.js --no-coverage
```

Expected: FAIL — `capturedEmailList` is undefined (opts.senderEmails not passed yet)

- [ ] **Step 3: Update instantly.js createCampaign to accept senderEmails option**

In `backend/services/instantly.js`, change the `createCampaign` function signature and the `sendingAccounts` line:

Find:
```js
export async function createCampaign(name, opts = {}) {
  const { mode, fetch: fetchFn, ...restOpts } = opts;
  const sendingAccounts = env.INSTANTLY_SENDING_ACCOUNTS
    ? env.INSTANTLY_SENDING_ACCOUNTS.split(",").map(s => s.trim()).filter(Boolean)
    : undefined;
```

Replace with:
```js
export async function createCampaign(name, opts = {}) {
  const { mode, senderEmails, fetch: fetchFn } = opts;
  const sendingAccounts = senderEmails?.length
    ? senderEmails
    : env.INSTANTLY_SENDING_ACCOUNTS?.split(",").map(s => s.trim()).filter(Boolean);
```

- [ ] **Step 4: Update dispatchCampaign.js to pass senderEmails**

In `backend/workers/dispatchCampaign.js`, find the `createCampaign` call:

```js
const out = await instantly.createCampaign(campaign.name, { mode: campaign.mode });
```

Replace with:

```js
const senderEmails = campaign.senderEmail ? [campaign.senderEmail] : undefined;
const out = await instantly.createCampaign(campaign.name, { mode: campaign.mode, senderEmails });
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && npx jest tests/workers/dispatchCampaign.senderEmail.test.js --no-coverage
```

Expected: PASS — 2 tests green

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && npm test -- --no-coverage
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/services/instantly.js backend/workers/dispatchCampaign.js backend/tests/workers/dispatchCampaign.senderEmail.test.js
git commit -m "feat(dispatch): use campaign.senderEmail with env-var fallback"
```

---

## Task 6: Frontend — /settings/senders page

**Files:**
- Create: `frontend/src/app/(app)/settings/senders/page.jsx`

- [ ] **Step 1: Create the senders page**

Create `frontend/src/app/(app)/settings/senders/page.jsx`:

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function SendersPage() {
  const { data: session } = useSession();
  const [senders, setSenders] = useState([]);
  const [users, setUsers] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const token = session?.backendToken;

  async function load() {
    if (!token) return;
    try {
      const [{ senders }, { users }] = await Promise.all([
        apiFetch("/api/sender-accounts", { token }),
        apiFetch("/api/users", { token })
      ]);
      setSenders(senders);
      setUsers(users);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, [token]);

  async function onSync() {
    setSyncing(true); setError(""); setSyncMsg("");
    try {
      const { synced } = await apiFetch("/api/sender-accounts/sync", { token, method: "POST" });
      setSyncMsg(`Synced ${synced} accounts from Instantly.`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  }

  async function onAssign(senderEmail, userId) {
    if (!userId) return;
    try {
      await apiFetch(`/api/sender-accounts/${encodeURIComponent(senderEmail)}/assign`, {
        token, method: "POST", body: { userId }
      });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function onUnassign(senderEmail, userId) {
    try {
      await apiFetch(`/api/sender-accounts/${encodeURIComponent(senderEmail)}/assign/${userId}`, {
        token, method: "DELETE"
      });
      await load();
    } catch (e) { setError(e.message); }
  }

  if (session?.user?.role !== "ADMIN") return <p className="text-red-600">Forbidden</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sender Accounts</h1>
        <button
          onClick={onSync}
          disabled={syncing}
          className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync from Instantly"}
        </button>
      </div>

      {syncMsg && <p className="text-green-700 text-sm">{syncMsg}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {senders.length === 0 ? (
        <p className="text-gray-500 text-sm">No sender accounts synced yet. Click Sync to pull from Instantly.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Email</th>
              <th className="py-2">Status</th>
              <th className="py-2">Assigned To</th>
              <th className="py-2">Add Assignment</th>
            </tr>
          </thead>
          <tbody>
            {senders.map((s) => (
              <tr key={s.email} className="border-b">
                <td className="py-2 font-mono text-xs">{s.email}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    s.status === "active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {s.status ?? "unknown"}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {s.assignments.map(a => (
                      <span key={a.user.id} className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {a.user.name || a.user.email}
                        <button
                          onClick={() => onUnassign(s.email, a.user.id)}
                          className="text-gray-400 hover:text-red-600 ml-1"
                        >×</button>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2">
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) { onAssign(s.email, e.target.value); e.target.value = ""; } }}
                    className="border p-1 rounded text-xs"
                  >
                    <option value="">+ Assign user…</option>
                    {users
                      .filter(u => !s.assignments.some(a => a.user.id === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))
                    }
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(app\)/settings/senders/page.jsx
git commit -m "feat(frontend): add /settings/senders admin page"
```

---

## Task 7: Sidebar — add Senders link for admins

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add Senders nav entry with adminOnly flag**

In `frontend/src/components/Sidebar.jsx`, find the NAV array:

```js
const NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: "/icon-dashboard.png" },
  { href: "/campaigns",  label: "Campaigns",  icon: "/icon-campaigns.png" },
  { href: "/leads",      label: "Leads",      icon: "/icon-leads.png" },
  { href: "/replies",    label: "Replies",    icon: "/icon-replies.png" },
  { href: "/export",     label: "Export",     icon: "/icon-export.png" },
  { href: "/settings",   label: "Settings",   icon: "/icon-settings.png" },
];
```

Replace with:

```js
const NAV = [
  { href: "/dashboard",         label: "Dashboard",  icon: "/icon-dashboard.png" },
  { href: "/campaigns",         label: "Campaigns",  icon: "/icon-campaigns.png" },
  { href: "/leads",             label: "Leads",      icon: "/icon-leads.png" },
  { href: "/replies",           label: "Replies",    icon: "/icon-replies.png" },
  { href: "/export",            label: "Export",     icon: "/icon-export.png" },
  { href: "/settings",          label: "Settings",   icon: "/icon-settings.png" },
  { href: "/settings/senders",  label: "Senders",    icon: "/icon-settings.png", adminOnly: true },
];
```

Then find the `{NAV.map(...)}` section and update it to filter admin-only items:

```jsx
{NAV.filter(item => !item.adminOnly || session?.user?.role === "ADMIN").map(({ href, label, icon }) => {
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat(frontend): add Senders nav link for admins"
```

---

## Task 8: Campaign wizard — sender selection

**Files:**
- Modify: `frontend/src/components/CampaignWizard.jsx`

- [ ] **Step 1: Add sender state and fetch to CampaignWizard**

In `frontend/src/components/CampaignWizard.jsx`, add to the existing state declarations at the top:

```js
const [senderEmail, setSenderEmail] = useState("");
const [senders, setSenders] = useState([]);
const [sendersLoading, setSendersLoading] = useState(false);
```

Add a `useEffect` to load the user's assigned senders (after the existing state declarations):

```js
useEffect(() => {
  if (!session?.backendToken) return;
  setSendersLoading(true);
  apiFetch("/api/sender-accounts/mine", { token: session.backendToken })
    .then(({ senders }) => { setSenders(senders); if (senders.length === 1) setSenderEmail(senders[0].email); })
    .catch(() => {})
    .finally(() => setSendersLoading(false));
}, [session?.backendToken]);
```

- [ ] **Step 2: Add senderEmail to the submission body**

Find the `const body = { name, rawGoal, mode };` line and add senderEmail:

```js
const body = { name, rawGoal, mode };
if (senderEmail) body.senderEmail = senderEmail;
```

- [ ] **Step 3: Add sender dropdown to the form**

In the form JSX, add the sender dropdown before the submit button. Find the closing `</form>` tag area and add this block before it (after the clarification message and before the submit button):

```jsx
{/* Sender selection */}
{!sendersLoading && senders.length === 0 && (
  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
    No sending account assigned to you. Ask your admin to assign one from Settings → Senders.
  </div>
)}
{senders.length > 1 && (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">Send from</label>
    <select
      value={senderEmail}
      onChange={(e) => setSenderEmail(e.target.value)}
      className="border p-2 rounded w-full text-sm"
      required
    >
      <option value="">Select a sending account…</option>
      {senders.map(s => (
        <option key={s.email} value={s.email}>{s.email}</option>
      ))}
    </select>
  </div>
)}
{senders.length === 1 && (
  <p className="text-xs text-gray-500">Sending from: <span className="font-mono">{senders[0].email}</span></p>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CampaignWizard.jsx
git commit -m "feat(frontend): add sender selection to campaign wizard"
```

---

## Task 9: Update campaign creation route to accept and store senderEmail

**Files:**
- Modify: `backend/routes/campaigns.js`

- [ ] **Step 1: Write the failing test**

In `backend/tests/routes/campaigns.test.js`, add this test inside the `describe("campaigns routes")` block:

```js
test("POST /api/campaigns stores senderEmail when provided", async () => {
  const { token, user } = await createUser({ role: "MANAGER", email: "mgr_sender@x.com" });

  // Create a sender account and assign it to this user
  await prisma.senderAccount.create({
    data: { accountId: "acc_s1", email: "alice@nstx.co.in", status: "active" }
  });
  await prisma.userSenderAccount.create({
    data: { userId: user.id, senderEmail: "alice@nstx.co.in" }
  });

  const res = await request(app)
    .post("/api/campaigns")
    .set(authHeader(token))
    .send({ name: "Sender Test", rawGoal: "Engineers at startups", senderEmail: "alice@nstx.co.in" });

  expect(res.status).toBe(201);
  expect(res.body.campaign.senderEmail).toBe("alice@nstx.co.in");
});

test("POST /api/campaigns rejects senderEmail not assigned to user", async () => {
  const { token } = await createUser({ role: "MANAGER", email: "mgr_nosender@x.com" });

  await prisma.senderAccount.create({
    data: { accountId: "acc_s2", email: "other@nstx.co.in", status: "active" }
  });
  // Note: NOT assigned to this user

  const res = await request(app)
    .post("/api/campaigns")
    .set(authHeader(token))
    .send({ name: "Sender Test 2", rawGoal: "Engineers at startups", senderEmail: "other@nstx.co.in" });

  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage -t "senderEmail"
```

Expected: FAIL — `senderEmail` is not stored and no 403 on unassigned sender

- [ ] **Step 3: Update campaigns.js createSchema and handler**

In `backend/routes/campaigns.js`, find the campaign creation Zod schema (it includes `name`, `rawGoal`, `mode`, etc.) and add:

```js
senderEmail: z.string().email().optional(),
```

In the campaign creation handler, after the schema parse and before `prisma.campaign.create`, add the validation:

```js
if (parsed.data.senderEmail) {
  const assignment = await prisma.userSenderAccount.findUnique({
    where: { userId_senderEmail: { userId: req.user.id, senderEmail: parsed.data.senderEmail } }
  });
  if (!assignment) return res.status(403).json({ error: "sender_not_assigned" });
}
```

And add `senderEmail: parsed.data.senderEmail` to the `prisma.campaign.create({ data: { ... } })` call.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest tests/routes/campaigns.test.js --no-coverage
```

Expected: all campaign tests pass

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && npm test -- --no-coverage
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/routes/campaigns.js backend/tests/routes/campaigns.test.js
git commit -m "feat(campaigns): accept and validate senderEmail on creation"
```

---

## Task 10: End-to-end smoke test (manual)

- [ ] Start backend: `npm run dev:backend` — confirm `workers registered` with no errors
- [ ] Start frontend: `npm run dev:frontend`
- [ ] Log in as admin, go to **Settings → Senders**
- [ ] Click **Sync from Instantly** — table should populate with your Instantly accounts
- [ ] Assign `alice@nstx.co.in` to a MANAGER user
- [ ] Log in as that MANAGER, go to **New Campaign**
- [ ] Confirm the sender dropdown shows `alice@nstx.co.in`
- [ ] Create a campaign — confirm `senderEmail` appears in the campaign record (`GET /api/campaigns/:id`)
- [ ] Log in as a user with **no senders assigned** — confirm the amber warning banner appears in the wizard

- [ ] **Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore: multi-sender smoke test cleanup"
```
