# AI Outreach Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous AI-driven outbound email platform that takes a natural-language goal and produces a fully executed campaign: Gemini-extracted filters → Lusha leads → Gemini emails → Instantly.ai dispatch → webhook reply classification + follow-up drafts.

**Architecture:** Monorepo with two apps — a Next.js 15 (App Router) frontend and a Node.js/Express backend — sharing a single Postgres database via Prisma. Long-running work (lead fetching, email generation, dispatch, reply processing) runs as pg-boss background jobs in the backend process. Authentication uses JWT issued by the backend and consumed by both apps. No Redis; pg-boss uses the same Postgres instance.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, Node.js, Express, PostgreSQL, Prisma, pg-boss, NextAuth.js, JWT, bcrypt, Gemini API (`gemini-2.5-flash`), Lusha Prospecting + Signals APIs, Instantly.ai API v2, exceljs. Tests: Jest + supertest (backend), Vitest + React Testing Library (frontend).

**Phases (execute in order — each phase is independently testable):**

1. **Phase 0:** Repo scaffold, Prisma schema, Postgres, test infra
2. **Phase 1:** Auth (backend JWT + frontend NextAuth) + RBAC
3. **Phase 2:** pg-boss job queue bootstrap + job polling endpoint
4. **Phase 3:** Campaign creation + Gemini filter extraction
5. **Phase 4:** Lusha lead fetching worker + campaign run endpoint
6. **Phase 5:** Gemini email generation worker + email routes
7. **Phase 6:** Instantly.ai dispatch worker + pipeline chaining
8. **Phase 7:** Reply webhook + sentiment classification + follow-up drafting
9. **Phase 8:** Export to .xlsx
10. **Phase 9:** Settings page + deliverability checklist

---

## File Structure

```
/outreach-app
├── package.json                          → npm workspaces root
├── .env.example
├── .gitignore
├── /frontend                             → Next.js 15
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.js
│   ├── postcss.config.mjs
│   ├── vitest.config.js
│   └── /src
│       ├── /app
│       │   ├── layout.jsx
│       │   ├── page.jsx                  → redirects to /dashboard
│       │   ├── (auth)/login/page.jsx
│       │   └── (app)/
│       │       ├── layout.jsx            → protected shell
│       │       ├── dashboard/page.jsx
│       │       ├── campaigns/page.jsx
│       │       ├── campaigns/new/page.jsx
│       │       ├── campaigns/[id]/page.jsx
│       │       ├── leads/page.jsx
│       │       ├── leads/[id]/page.jsx
│       │       ├── replies/page.jsx
│       │       ├── export/page.jsx
│       │       ├── settings/page.jsx
│       │       └── settings/users/page.jsx
│       ├── /components
│       │   ├── CampaignWizard.jsx
│       │   ├── FilterPreview.jsx
│       │   ├── JobProgressBar.jsx
│       │   ├── LeadTable.jsx
│       │   ├── EmailDraftPanel.jsx
│       │   ├── ReplyCard.jsx
│       │   ├── SentimentBadge.jsx
│       │   ├── RoleGuard.jsx
│       │   └── ExportModal.jsx
│       └── /lib
│           ├── api.js                    → fetch wrapper w/ JWT header
│           └── auth.js                   → NextAuth config + role helpers
│
├── /backend                              → Node.js + Express
│   ├── package.json
│   ├── jest.config.js
│   ├── server.js                         → entry point
│   ├── app.js                            → Express app (testable without listen)
│   ├── /config
│   │   └── env.js                        → typed env loader + validation
│   ├── /lib
│   │   ├── prisma.js                     → shared PrismaClient
│   │   ├── pgboss.js                     → shared pg-boss instance
│   │   └── logger.js
│   ├── /routes
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── campaigns.js
│   │   ├── leads.js
│   │   ├── emails.js
│   │   ├── replies.js
│   │   ├── webhooks.js
│   │   ├── export.js
│   │   └── jobs.js
│   ├── /services
│   │   ├── prompt.js                     → Gemini NL → Lusha filters
│   │   ├── gemini.js                     → shared Gemini client
│   │   ├── lusha.js
│   │   ├── emailGen.js
│   │   ├── instantly.js
│   │   ├── replyHandler.js
│   │   └── export.js
│   ├── /workers
│   │   ├── index.js                      → registers all workers
│   │   ├── fetchLeads.js
│   │   ├── generateEmail.js
│   │   ├── dispatchCampaign.js
│   │   └── processReply.js
│   ├── /middleware
│   │   ├── auth.js                       → JWT verification
│   │   ├── rbac.js                       → role gate factory
│   │   └── errorHandler.js
│   ├── /prisma
│   │   ├── schema.prisma
│   │   └── /migrations
│   └── /tests
│       ├── setup.js
│       ├── helpers/factory.js
│       ├── routes/*.test.js
│       ├── services/*.test.js
│       └── workers/*.test.js
│
└── /shared
    └── constants.js                      → enums mirrored from Prisma
```

---

## Phase 0 — Repo Scaffold, Prisma, Test Infrastructure

### Task 0.1: Initialize monorepo root

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `README.md`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "outreach-app",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev:backend": "npm --workspace backend run dev",
    "dev:frontend": "npm --workspace frontend run dev",
    "test:backend": "npm --workspace backend test",
    "test:frontend": "npm --workspace frontend test"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules
.env
.env.local
.next
dist
coverage
*.log
.DS_Store
```

- [ ] **Step 3: Create `.env.example`** with every var from spec §11 (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, GEMINI_API_KEY, GEMINI_MODEL=gemini-2.5-flash, LUSHA_API_KEY, INSTANTLY_API_KEY, INSTANTLY_WEBHOOK_SECRET, FRONTEND_URL, BACKEND_URL, JWT_SECRET).

- [ ] **Step 4: Commit**

```bash
git init && git add -A && git commit -m "chore: initialize monorepo root"
```

---

### Task 0.2: Scaffold backend Express app with Jest

**Files:**
- Create: `backend/package.json`, `backend/app.js`, `backend/server.js`, `backend/jest.config.js`, `backend/config/env.js`, `backend/lib/logger.js`, `backend/middleware/errorHandler.js`, `backend/tests/setup.js`, `backend/tests/app.test.js`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch server.js",
    "start": "node server.js",
    "test": "NODE_OPTIONS=--experimental-vm-modules jest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "dotenv": "^16.4.5",
    "@prisma/client": "^5.18.0",
    "pg-boss": "^9.0.3",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.8",
    "exceljs": "^4.4.0",
    "@google/generative-ai": "^0.17.1"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "prisma": "^5.18.0",
    "nock": "^13.5.4"
  }
}
```

- [ ] **Step 2: Create `backend/jest.config.js`**

```js
export default {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEach: ["<rootDir>/tests/setup.js"],
  transform: {}
};
```

- [ ] **Step 3: Create `backend/config/env.js`**

```js
import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  LUSHA_API_KEY: z.string().optional(),
  INSTANTLY_API_KEY: z.string().optional(),
  INSTANTLY_WEBHOOK_SECRET: z.string().optional(),
  FRONTEND_URL: z.string().default("http://localhost:3000")
});

export const env = schema.parse(process.env);
```

- [ ] **Step 4: Create `backend/lib/logger.js`**

```js
export const logger = {
  info: (...a) => console.log("[info]", ...a),
  warn: (...a) => console.warn("[warn]", ...a),
  error: (...a) => console.error("[error]", ...a)
};
```

- [ ] **Step 5: Create `backend/middleware/errorHandler.js`**

```js
import { logger } from "../lib/logger.js";

export function errorHandler(err, req, res, _next) {
  logger.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || "internal_error",
    message: err.expose ? err.message : "Something went wrong"
  });
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}
```

- [ ] **Step 6: Write failing test `backend/tests/app.test.js`**

```js
import request from "supertest";
import { createApp } from "../app.js";

describe("app", () => {
  const app = createApp();

  test("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("unknown route returns 404", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 7: Create empty `backend/tests/setup.js`**

```js
// global test setup placeholder
```

- [ ] **Step 8: Run test — verify FAIL**

```bash
cd backend && npm install && npm test -- app.test.js
```

Expected: FAIL — `Cannot find module '../app.js'`

- [ ] **Step 9: Create `backend/app.js`**

```js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 10: Create `backend/server.js`**

```js
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();
app.listen(env.PORT, () => logger.info(`backend listening on :${env.PORT}`));
```

- [ ] **Step 11: Run test — verify PASS**

```bash
cd backend && npm test -- app.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 12: Commit**

```bash
git add backend/ && git commit -m "feat(backend): scaffold Express app with health check and Jest"
```

---

### Task 0.3: Prisma schema + first migration

**Files:**
- Create: `backend/prisma/schema.prisma`, `backend/lib/prisma.js`, `backend/tests/prisma.test.js`

- [ ] **Step 1: Create `backend/prisma/schema.prisma`** (full schema from spec §4)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role            { ADMIN MANAGER VIEWER }
enum CampaignStatus  { DRAFT RUNNING PAUSED COMPLETED }
enum LeadStatus      { NEW CONTACTED REPLIED INTERESTED NOT_INTERESTED NEUTRAL CONVERTIBLE SKIPPED }
enum EmailStatus     { DRAFT SENT FAILED }
enum Sentiment       { INTERESTED NOT_INTERESTED NEUTRAL CONVERTIBLE }

model User {
  id        String     @id @default(cuid())
  email     String     @unique
  name      String?
  password  String
  role      Role       @default(VIEWER)
  campaigns Campaign[]
  createdAt DateTime   @default(now())
}

model Campaign {
  id                  String         @id @default(cuid())
  name                String
  rawGoal             String
  extractedFilters    Json
  status              CampaignStatus @default(DRAFT)
  createdBy           User           @relation(fields: [createdById], references: [id])
  createdById         String
  leads               Lead[]
  instantlyCampaignId String?
  createdAt           DateTime       @default(now())
}

model Lead {
  id            String     @id @default(cuid())
  lushaPersonId String?    @unique
  firstName     String
  lastName      String
  email         String?
  title         String?
  company       String?
  location      String?
  linkedinUrl   String?
  department    String?
  seniority     String?
  status        LeadStatus @default(NEW)
  campaign      Campaign   @relation(fields: [campaignId], references: [id])
  campaignId    String
  emails        Email[]
  replies       Reply[]
  createdAt     DateTime   @default(now())
}

model Email {
  id        String      @id @default(cuid())
  lead      Lead        @relation(fields: [leadId], references: [id])
  leadId    String
  subject   String
  body      String
  version   Int         @default(1)
  status    EmailStatus @default(DRAFT)
  sentAt    DateTime?
  createdAt DateTime    @default(now())
}

model Reply {
  id            String     @id @default(cuid())
  lead          Lead       @relation(fields: [leadId], references: [id])
  leadId        String
  body          String
  sentiment     Sentiment?
  draftFollowUp String?
  receivedAt    DateTime
  createdAt     DateTime   @default(now())

  @@unique([leadId, receivedAt])
}
```

- [ ] **Step 2: Create `backend/lib/prisma.js`**

```js
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
```

- [ ] **Step 3: Ensure Postgres is running locally** (user action)

Run: `createdb outreach` (or equivalent). Set `DATABASE_URL=postgresql://localhost:5432/outreach` in `backend/.env`.

- [ ] **Step 4: Run first migration**

```bash
cd backend && npx prisma migrate dev --name init
```

Expected: migration created in `backend/prisma/migrations/` and client generated.

- [ ] **Step 5: Write smoke test `backend/tests/prisma.test.js`**

```js
import { prisma } from "../lib/prisma.js";

describe("prisma", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  test("can query users table", async () => {
    const count = await prisma.user.count();
    expect(typeof count).toBe("number");
  });
});
```

- [ ] **Step 6: Run and verify PASS**

```bash
cd backend && npm test -- prisma.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add Prisma schema and initial migration"
```

---

### Task 0.4: Scaffold Next.js 15 frontend

**Files:**
- Create: `frontend/package.json`, `frontend/next.config.mjs`, `frontend/tailwind.config.js`, `frontend/postcss.config.mjs`, `frontend/src/app/layout.jsx`, `frontend/src/app/page.jsx`, `frontend/src/app/globals.css`, `frontend/vitest.config.js`, `frontend/src/app/__tests__/page.test.jsx`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "next-auth": "^4.24.7"
  },
  "devDependencies": {
    "vitest": "^2.0.5",
    "@vitejs/plugin-react": "^4.3.1",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.8",
    "jsdom": "^24.1.1",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.4.41"
  }
}
```

- [ ] **Step 2: Create `frontend/next.config.mjs`**

```js
export default { reactStrictMode: true };
```

- [ ] **Step 3: Create `frontend/postcss.config.mjs`**

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

- [ ] **Step 4: Create `frontend/tailwind.config.js`**

```js
export default {
  content: ["./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: []
};
```

- [ ] **Step 5: Create `frontend/src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Create `frontend/src/app/layout.jsx`**

```jsx
import "./globals.css";

export const metadata = { title: "Outreach App" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `frontend/vitest.config.js`**

```js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: []
  }
});
```

- [ ] **Step 8: Write failing test `frontend/src/app/__tests__/page.test.jsx`**

```jsx
import { render, screen } from "@testing-library/react";
import Home from "../page.jsx";

test("home renders heading", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: /outreach/i })).toBeInTheDocument();
});
```

- [ ] **Step 9: Run — verify FAIL**

```bash
cd frontend && npm install && npm test
```

Expected: FAIL (page.jsx missing).

- [ ] **Step 10: Create `frontend/src/app/page.jsx`**

```jsx
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Outreach App</h1>
    </main>
  );
}
```

- [ ] **Step 11: Run — verify PASS**

```bash
cd frontend && npm test
```

- [ ] **Step 12: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): scaffold Next.js 15 + Tailwind + Vitest"
```

---

## Phase 1 — Authentication + RBAC

### Task 1.1: Password hashing + JWT helpers

**Files:**
- Create: `backend/lib/auth.js`, `backend/tests/lib/auth.test.js`

- [ ] **Step 1: Write failing test**

```js
import { hashPassword, verifyPassword, signToken, verifyToken } from "../../lib/auth.js";

describe("auth lib", () => {
  test("hash and verify password round-trip", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  test("sign and verify JWT round-trip", () => {
    const token = signToken({ sub: "u1", role: "ADMIN" });
    const payload = verifyToken(token);
    expect(payload.sub).toBe("u1");
    expect(payload.role).toBe("ADMIN");
  });

  test("verifyToken throws on tampered token", () => {
    expect(() => verifyToken("not.a.token")).toThrow();
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`cd backend && npm test -- lib/auth.test.js`)

- [ ] **Step 3: Create `backend/lib/auth.js`**

```js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload, opts = {}) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d", ...opts });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/lib/auth.js backend/tests/lib/ && git commit -m "feat(backend): add password hashing and JWT helpers"
```

---

### Task 1.2: Auth middleware + RBAC factory

**Files:**
- Create: `backend/middleware/auth.js`, `backend/middleware/rbac.js`, `backend/tests/middleware/auth.test.js`, `backend/tests/middleware/rbac.test.js`

- [ ] **Step 1: Write failing test `backend/tests/middleware/auth.test.js`**

```js
import request from "supertest";
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { signToken } from "../../lib/auth.js";

function makeApp() {
  const app = express();
  app.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
  return app;
}

describe("requireAuth", () => {
  test("401 when header missing", async () => {
    const res = await request(makeApp()).get("/me");
    expect(res.status).toBe(401);
  });

  test("401 when token invalid", async () => {
    const res = await request(makeApp()).get("/me").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
  });

  test("attaches user payload on success", async () => {
    const token = signToken({ sub: "u1", role: "ADMIN" });
    const res = await request(makeApp()).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe("u1");
  });
});
```

- [ ] **Step 2: Write failing test `backend/tests/middleware/rbac.test.js`**

```js
import request from "supertest";
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { signToken } from "../../lib/auth.js";

function makeApp() {
  const app = express();
  app.get("/admin", requireAuth, requireRole("ADMIN"), (_req, res) => res.json({ ok: true }));
  app.get("/mgr", requireAuth, requireRole("ADMIN", "MANAGER"), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("requireRole", () => {
  test("403 when role not permitted", async () => {
    const token = signToken({ sub: "u1", role: "VIEWER" });
    const res = await request(makeApp()).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("200 when role matches", async () => {
    const token = signToken({ sub: "u1", role: "ADMIN" });
    const res = await request(makeApp()).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("200 when role in allow list", async () => {
    const token = signToken({ sub: "u1", role: "MANAGER" });
    const res = await request(makeApp()).get("/mgr").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run — verify FAIL**

- [ ] **Step 4: Create `backend/middleware/auth.js`**

```js
import { verifyToken } from "../lib/auth.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}
```

- [ ] **Step 5: Create `backend/middleware/rbac.js`**

```js
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}
```

- [ ] **Step 6: Run — verify PASS**

- [ ] **Step 7: Commit**

```bash
git add backend/middleware/ backend/tests/middleware/ && git commit -m "feat(backend): add JWT auth and RBAC middleware"
```

---

### Task 1.3: POST /api/auth/login route

**Files:**
- Create: `backend/routes/auth.js`, `backend/tests/routes/auth.test.js`
- Modify: `backend/app.js`, `backend/tests/setup.js`

- [ ] **Step 1: Update `backend/tests/setup.js` with DB reset helper**

```js
import { prisma } from "../lib/prisma.js";

export async function resetDb() {
  await prisma.reply.deleteMany();
  await prisma.email.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
}

afterAll(async () => { await prisma.$disconnect(); });
```

- [ ] **Step 2: Write failing test `backend/tests/routes/auth.test.js`**

```js
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/auth.js";
import { resetDb } from "../setup.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  await prisma.user.create({
    data: { email: "a@b.com", password: await hashPassword("secret123"), role: "ADMIN" }
  });
});

describe("POST /api/auth/login", () => {
  test("returns token on valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("a@b.com");
    expect(res.body.user.password).toBeUndefined();
  });

  test("401 on wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  test("401 on unknown email", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x@y.com", password: "secret123" });
    expect(res.status).toBe(401);
  });

  test("400 on missing fields", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run — verify FAIL**

- [ ] **Step 4: Create `backend/routes/auth.js`**

```js
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { verifyPassword, signToken } from "../lib/auth.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const token = signToken({ sub: user.id, role: user.role });
    const { password: _p, ...safe } = user;
    res.json({ token, user: safe });
  } catch (e) { next(e); }
});

router.post("/logout", (_req, res) => res.json({ ok: true }));

export default router;
```

- [ ] **Step 5: Wire route in `backend/app.js`** — add after `app.use(morgan)`:

```js
import authRouter from "./routes/auth.js";
// ...
app.use("/api/auth", authRouter);
```

- [ ] **Step 6: Run — verify PASS**

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add POST /api/auth/login"
```

---

### Task 1.4: User management routes (admin only)

**Files:**
- Create: `backend/routes/users.js`, `backend/tests/routes/users.test.js`, `backend/tests/helpers/factory.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Create `backend/tests/helpers/factory.js`**

```js
import { prisma } from "../../lib/prisma.js";
import { hashPassword, signToken } from "../../lib/auth.js";

export async function createUser({ email = `u${Date.now()}@test.com`, role = "VIEWER", password = "secret123" } = {}) {
  const user = await prisma.user.create({
    data: { email, password: await hashPassword(password), role }
  });
  return { user, token: signToken({ sub: user.id, role: user.role }) };
}

export function authHeader(token) { return { Authorization: `Bearer ${token}` }; }
```

- [ ] **Step 2: Write failing test `backend/tests/routes/users.test.js`**

```js
import request from "supertest";
import { createApp } from "../../app.js";
import { resetDb } from "../setup.js";
import { createUser, authHeader } from "../helpers/factory.js";

const app = createApp();
beforeEach(async () => { await resetDb(); });

describe("users routes", () => {
  test("GET /api/users forbidden for non-admin", async () => {
    const { token } = await createUser({ role: "VIEWER" });
    const res = await request(app).get("/api/users").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users returns list for admin", async () => {
    const { token } = await createUser({ role: "ADMIN", email: "admin@x.com" });
    await createUser({ email: "u2@x.com" });
    const res = await request(app).get("/api/users").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(2);
    expect(res.body.users[0].password).toBeUndefined();
  });

  test("POST /api/users creates user (admin)", async () => {
    const { token } = await createUser({ role: "ADMIN", email: "admin@x.com" });
    const res = await request(app).post("/api/users")
      .set(authHeader(token))
      .send({ email: "new@x.com", password: "secret123", role: "MANAGER", name: "New" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("new@x.com");
  });

  test("PATCH /api/users/:id/role updates role (admin)", async () => {
    const { token } = await createUser({ role: "ADMIN", email: "admin@x.com" });
    const { user } = await createUser({ email: "u@x.com", role: "VIEWER" });
    const res = await request(app).patch(`/api/users/${user.id}/role`)
      .set(authHeader(token))
      .send({ role: "MANAGER" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("MANAGER");
  });
});
```

- [ ] **Step 3: Run — verify FAIL**

- [ ] **Step 4: Create `backend/routes/users.js`**

```js
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

function safe(u) { const { password, ...rest } = u; return rest; }

router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ users: users.map(safe) });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
  name: z.string().optional()
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { email, password, role, name } = parsed.data;
    const user = await prisma.user.create({
      data: { email, password: await hashPassword(password), role, name }
    });
    res.status(201).json({ user: safe(user) });
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "email_taken" });
    next(e);
  }
});

const roleSchema = z.object({ role: z.enum(["ADMIN", "MANAGER", "VIEWER"]) });

router.patch("/:id/role", async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role }
    });
    res.json({ user: safe(user) });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;
```

- [ ] **Step 5: Wire in `backend/app.js`**

```js
import usersRouter from "./routes/users.js";
// ...
app.use("/api/users", usersRouter);
```

- [ ] **Step 6: Run — verify PASS**

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add admin-only user management routes"
```

---

### Task 1.5: Frontend API client + NextAuth credentials provider

**Files:**
- Create: `frontend/src/lib/api.js`, `frontend/src/lib/auth.js`, `frontend/src/app/api/auth/[...nextauth]/route.js`
- Modify: `frontend/src/app/layout.jsx`, `frontend/.env.local.example`

- [ ] **Step 1: Create `frontend/src/lib/api.js`**

```js
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export async function apiFetch(path, { token, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "request_failed"), { status: res.status, data });
  return data;
}
```

- [ ] **Step 2: Create `frontend/src/lib/auth.js`** (NextAuth config)

```js
import CredentialsProvider from "next-auth/providers/credentials";
import { apiFetch } from "./api.js";

export const authOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const { token, user } = await apiFetch("/api/auth/login", {
            method: "POST",
            body: { email: credentials.email, password: credentials.password }
          });
          return { id: user.id, email: user.email, name: user.name, role: user.role, backendToken: token };
        } catch {
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.backendToken = user.backendToken;
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.backendToken = token.backendToken;
      return session;
    }
  },
  pages: { signIn: "/login" }
};

export function hasRole(session, ...roles) {
  return session?.user && roles.includes(session.user.role);
}
```

- [ ] **Step 3: Create `frontend/src/app/api/auth/[...nextauth]/route.js`**

```js
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 4: Create `frontend/src/app/(auth)/login/page.jsx`**

```jsx
"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) setError("Invalid credentials");
    else router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded" required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded" required />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full bg-black text-white p-2 rounded">Sign in</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Wrap app with SessionProvider** — update `frontend/src/app/layout.jsx`:

```jsx
import "./globals.css";
import { SessionProvider } from "next-auth/react";

export const metadata = { title: "Outreach App" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

Note: in Next.js 15 you may need a client-side wrapper. If Next complains, create `frontend/src/components/Providers.jsx` as `"use client"` wrapping `SessionProvider` and use it here.

- [ ] **Step 6: Create protected layout `frontend/src/app/(app)/layout.jsx`**

```jsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen">
      <header className="border-b p-4 flex justify-between">
        <span className="font-bold">Outreach</span>
        <span className="text-sm text-gray-600">{session.user.email} · {session.user.role}</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 7: Create placeholder `frontend/src/app/(app)/dashboard/page.jsx`**

```jsx
export default function DashboardPage() {
  return <h1 className="text-xl font-bold">Dashboard</h1>;
}
```

- [ ] **Step 8: Manual smoke test**

Run backend (`cd backend && npm run dev`) + frontend (`cd frontend && npm run dev`). Create an admin user via `psql` or a one-off script, visit `/login`, sign in, confirm redirect to `/dashboard`.

- [ ] **Step 9: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): add NextAuth credentials login and protected layout"
```

---

### Task 1.6: Users admin page

**Files:**
- Create: `frontend/src/app/(app)/settings/users/page.jsx`, `frontend/src/components/RoleGuard.jsx`

- [ ] **Step 1: Create `frontend/src/components/RoleGuard.jsx`**

```jsx
"use client";
import { useSession } from "next-auth/react";

export default function RoleGuard({ roles, children, fallback = null }) {
  const { data: session } = useSession();
  if (!session || !roles.includes(session.user.role)) return fallback;
  return children;
}
```

- [ ] **Step 2: Create `frontend/src/app/(app)/settings/users/page.jsx`**

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function UsersAdminPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", role: "VIEWER", name: "" });
  const [error, setError] = useState("");
  const token = session?.backendToken;

  async function load() {
    if (!token) return;
    try { const { users } = await apiFetch("/api/users", { token }); setUsers(users); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [token]);

  async function onCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/users", { token, method: "POST", body: form });
      setForm({ email: "", password: "", role: "VIEWER", name: "" });
      load();
    } catch (e) { setError(e.message); }
  }

  if (session && session.user.role !== "ADMIN") return <p>Forbidden</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Users</h1>
      <form onSubmit={onCreate} className="flex gap-2 items-end">
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border p-2 rounded" />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border p-2 rounded" />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border p-2 rounded" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="border p-2 rounded">
          <option>ADMIN</option><option>MANAGER</option><option>VIEWER</option>
        </select>
        <button className="bg-black text-white px-4 py-2 rounded">Add</button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Email</th><th>Name</th><th>Role</th></tr></thead>
        <tbody>{users.map((u) => <tr key={u.id} className="border-b"><td>{u.email}</td><td>{u.name}</td><td>{u.role}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke test** — visit `/settings/users` as admin, create a new user, verify it appears.

- [ ] **Step 4: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): add admin users page"
```

---

## Phase 2 — pg-boss Job Queue Bootstrap

### Task 2.1: pg-boss singleton + job polling endpoint

**Files:**
- Create: `backend/lib/pgboss.js`, `backend/routes/jobs.js`, `backend/tests/routes/jobs.test.js`, `backend/workers/index.js`
- Modify: `backend/server.js`, `backend/app.js`

- [ ] **Step 1: Create `backend/lib/pgboss.js`**

```js
import PgBoss from "pg-boss";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

let instance = null;

export async function getBoss() {
  if (instance) return instance;
  instance = new PgBoss({ connectionString: env.DATABASE_URL });
  instance.on("error", (e) => logger.error("pgboss", e));
  await instance.start();
  return instance;
}

export async function stopBoss() {
  if (instance) { await instance.stop({ graceful: true }); instance = null; }
}
```

- [ ] **Step 2: Create `backend/workers/index.js`** (placeholder registrar)

```js
import { getBoss } from "../lib/pgboss.js";
import { logger } from "../lib/logger.js";

export async function registerWorkers() {
  const boss = await getBoss();
  logger.info("workers registered (none yet)");
  return boss;
}
```

- [ ] **Step 3: Update `backend/server.js`**

```js
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { registerWorkers } from "./workers/index.js";

const app = createApp();
app.listen(env.PORT, async () => {
  logger.info(`backend listening on :${env.PORT}`);
  await registerWorkers();
});
```

- [ ] **Step 4: Write failing test `backend/tests/routes/jobs.test.js`**

```js
import request from "supertest";
import { createApp } from "../../app.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { getBoss, stopBoss } from "../../lib/pgboss.js";

const app = createApp();

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await stopBoss(); });

describe("GET /api/jobs/:id", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get("/api/jobs/fake-id");
    expect(res.status).toBe(401);
  });

  test("returns job state for real job", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const boss = await getBoss();
    const jobId = await boss.send("test-queue", { hello: "world" });
    const res = await request(app).get(`/api/jobs/${jobId}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.job.id).toBe(jobId);
    expect(["created", "active", "completed", "retry"]).toContain(res.body.job.state);
  });

  test("404 on unknown job", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/jobs/00000000-0000-0000-0000-000000000000").set(authHeader(token));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run — verify FAIL**

- [ ] **Step 6: Create `backend/routes/jobs.js`**

```js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getBoss } from "../lib/pgboss.js";

const router = Router();
router.use(requireAuth);

router.get("/:id", async (req, res, next) => {
  try {
    const boss = await getBoss();
    const job = await boss.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: "not_found" });
    res.json({
      job: {
        id: job.id,
        name: job.name,
        state: job.state,
        data: job.data,
        createdOn: job.createdOn,
        completedOn: job.completedOn,
        retryCount: job.retryCount
      }
    });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 7: Wire in `backend/app.js`**

```js
import jobsRouter from "./routes/jobs.js";
// ...
app.use("/api/jobs", jobsRouter);
```

- [ ] **Step 8: Run — verify PASS**

- [ ] **Step 9: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add pg-boss singleton and jobs polling route"
```

---

## Phase 3 — Campaign Creation + Gemini Filter Extraction

### Task 3.1: Gemini client wrapper

**Files:**
- Create: `backend/services/gemini.js`, `backend/tests/services/gemini.test.js`

- [ ] **Step 1: Write failing test `backend/tests/services/gemini.test.js`**

```js
import { jest } from "@jest/globals";
import { generateJson } from "../../services/gemini.js";

describe("gemini.generateJson", () => {
  test("parses JSON from response text", async () => {
    const fakeClient = {
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => '```json\n{"foo":"bar"}\n```' }
      })
    };
    const result = await generateJson("prompt", { client: fakeClient });
    expect(result).toEqual({ foo: "bar" });
  });

  test("throws on invalid JSON", async () => {
    const fakeClient = {
      generateContent: jest.fn().mockResolvedValue({ response: { text: () => "not json" } })
    };
    await expect(generateJson("prompt", { client: fakeClient })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/services/gemini.js`**

```js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

let defaultClient = null;
function getDefault() {
  if (!defaultClient && env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    defaultClient = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
  }
  return defaultClient;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

export async function generateText(prompt, { client } = {}) {
  const c = client || getDefault();
  if (!c) throw new Error("GEMINI_API_KEY not configured");
  const res = await c.generateContent(prompt);
  return res.response.text();
}

export async function generateJson(prompt, opts = {}) {
  const text = await generateText(prompt, opts);
  return extractJson(text);
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add Gemini service wrapper"
```

---

### Task 3.2: prompt.js — NL → Lusha filters

**Files:**
- Create: `backend/services/prompt.js`, `backend/tests/services/prompt.test.js`

- [ ] **Step 1: Write failing test**

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
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/services/prompt.js`**

```js
import { generateJson } from "./gemini.js";

const SYSTEM_PROMPT = `You are a B2B prospecting assistant. Convert a natural-language outreach goal into structured Lusha Prospecting API filters.

Return JSON only, with this shape:
{
  "filters": {
    "titles": [string],
    "seniorities": [string],
    "departments": [string],
    "locations": [string],
    "industries": [string],
    "companySizes": [string],
    "companyStages": [string]
  },
  "confidence": number (0..1),
  "clarification": string (only if confidence < 0.7)
}

Use only fields that are clearly expressed in the goal. Omit unknown fields (do not invent values).`;

export async function extractFilters(rawGoal, { generate = generateJson } = {}) {
  const prompt = `${SYSTEM_PROMPT}\n\nGoal:\n${rawGoal}\n\nJSON:`;
  const result = await generate(prompt);
  if ((result.confidence ?? 0) < 0.7) {
    return { ...result, needsClarification: true, clarification: result.clarification || "Please add more detail." };
  }
  return { ...result, needsClarification: false };
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add Gemini-based filter extraction service"
```

---

### Task 3.3: Campaigns routes — create/list/detail

**Files:**
- Create: `backend/routes/campaigns.js`, `backend/tests/routes/campaigns.test.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Write failing test `backend/tests/routes/campaigns.test.js`**

```js
import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../app.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

jest.unstable_mockModule("../../services/prompt.js", () => ({
  extractFilters: jest.fn().mockResolvedValue({
    filters: { titles: ["Head of Engineering"], locations: ["India"] },
    confidence: 0.9,
    needsClarification: false
  })
}));

const { createApp: makeApp } = await import("../../app.js");
const app = makeApp();

beforeEach(async () => { await resetDb(); });

describe("campaigns routes", () => {
  test("POST /api/campaigns creates DRAFT with extracted filters", async () => {
    const { token } = await createUser({ role: "MANAGER" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "Q2 Hiring", rawGoal: "Heads of Engineering at unicorn startups in India" });
    expect(res.status).toBe(201);
    expect(res.body.campaign.status).toBe("DRAFT");
    expect(res.body.campaign.extractedFilters.titles).toContain("Head of Engineering");
  });

  test("POST /api/campaigns forbidden for VIEWER", async () => {
    const { token } = await createUser({ role: "VIEWER" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "X", rawGoal: "y" });
    expect(res.status).toBe(403);
  });

  test("GET /api/campaigns lists user-visible campaigns", async () => {
    const { token, user } = await createUser({ role: "MANAGER" });
    const { prisma } = await import("../../lib/prisma.js");
    await prisma.campaign.create({ data: { name: "A", rawGoal: "g", extractedFilters: {}, createdById: user.id } });
    const res = await request(app).get("/api/campaigns").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.campaigns.length).toBe(1);
  });

  test("GET /api/campaigns/:id returns detail", async () => {
    const { token, user } = await createUser({ role: "MANAGER" });
    const { prisma } = await import("../../lib/prisma.js");
    const c = await prisma.campaign.create({ data: { name: "A", rawGoal: "g", extractedFilters: { titles: ["X"] }, createdById: user.id } });
    const res = await request(app).get(`/api/campaigns/${c.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.campaign.id).toBe(c.id);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/routes/campaigns.js`**

```js
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { extractFilters } from "../services/prompt.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  rawGoal: z.string().min(5)
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const extraction = await extractFilters(parsed.data.rawGoal);
    if (extraction.needsClarification) {
      return res.status(422).json({ error: "needs_clarification", clarification: extraction.clarification });
    }
    const campaign = await prisma.campaign.create({
      data: {
        name: parsed.data.name,
        rawGoal: parsed.data.rawGoal,
        extractedFilters: extraction.filters,
        createdById: req.user.sub
      }
    });
    res.status(201).json({ campaign });
  } catch (e) { next(e); }
});

router.get("/", async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } }
    });
    res.json({ campaigns });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { leads: true } } }
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    res.json({ campaign });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Wire in `backend/app.js`**

```js
import campaignsRouter from "./routes/campaigns.js";
// ...
app.use("/api/campaigns", campaignsRouter);
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add campaigns create/list/detail routes"
```

---

### Task 3.4: CampaignWizard + campaigns pages

**Files:**
- Create: `frontend/src/components/CampaignWizard.jsx`, `frontend/src/components/FilterPreview.jsx`, `frontend/src/app/(app)/campaigns/page.jsx`, `frontend/src/app/(app)/campaigns/new/page.jsx`, `frontend/src/app/(app)/campaigns/[id]/page.jsx`

- [ ] **Step 1: Create `frontend/src/components/FilterPreview.jsx`**

```jsx
export default function FilterPreview({ filters }) {
  if (!filters) return null;
  const entries = Object.entries(filters).filter(([, v]) => Array.isArray(v) ? v.length : v);
  return (
    <div className="border rounded p-3 bg-gray-50 text-sm space-y-1">
      {entries.map(([k, v]) => (
        <div key={k}><span className="font-semibold">{k}:</span> {Array.isArray(v) ? v.join(", ") : v}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/CampaignWizard.jsx`**

```jsx
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function CampaignWizard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [rawGoal, setRawGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clarification, setClarification] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(""); setClarification("");
    try {
      const { campaign } = await apiFetch("/api/campaigns", {
        token: session.backendToken,
        method: "POST",
        body: { name, rawGoal }
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (e) {
      if (e.status === 422) setClarification(e.data?.clarification || "Please refine your goal.");
      else setError(e.message);
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <input className="w-full border p-2 rounded" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
      <textarea className="w-full border p-2 rounded h-32" placeholder="Describe your outreach goal in natural language" value={rawGoal} onChange={(e) => setRawGoal(e.target.value)} required />
      {clarification && <p className="text-amber-700 text-sm">{clarification}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button disabled={loading} className="bg-black text-white px-4 py-2 rounded">{loading ? "Analyzing..." : "Create campaign"}</button>
    </form>
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/(app)/campaigns/new/page.jsx`**

```jsx
import CampaignWizard from "@/components/CampaignWizard";

export default function NewCampaignPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">New campaign</h1>
      <CampaignWizard />
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/app/(app)/campaigns/page.jsx`**

```jsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function CampaignsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/campaigns", { token: session.backendToken }).then(({ campaigns }) => setItems(campaigns));
  }, [session?.backendToken]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between"><h1 className="text-xl font-bold">Campaigns</h1>
        <Link className="bg-black text-white px-3 py-2 rounded text-sm" href="/campaigns/new">New campaign</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Name</th><th>Status</th><th>Leads</th><th>Created</th></tr></thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b hover:bg-gray-50">
              <td className="py-2"><Link className="underline" href={`/campaigns/${c.id}`}>{c.name}</Link></td>
              <td>{c.status}</td>
              <td>{c._count?.leads ?? 0}</td>
              <td>{new Date(c.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/src/app/(app)/campaigns/[id]/page.jsx`** (stub — expanded in Phase 4)

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import FilterPreview from "@/components/FilterPreview";

export default function CampaignDetailPage({ params }) {
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState(null);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/campaigns/${params.id}`, { token: session.backendToken })
      .then(({ campaign }) => setCampaign(campaign));
  }, [session?.backendToken, params.id]);

  if (!campaign) return <p>Loading...</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{campaign.name}</h1>
      <p className="text-sm text-gray-600">Status: {campaign.status}</p>
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

- [ ] **Step 6: Manual smoke test** — sign in, create a campaign, verify filters appear on detail page.

- [ ] **Step 7: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): add campaign wizard, list, and detail pages"
```

---

## Phase 4 — Lusha Lead Fetching Worker

### Task 4.1: lusha.js service with rate limiting + backoff

**Files:**
- Create: `backend/services/lusha.js`, `backend/tests/services/lusha.test.js`

- [ ] **Step 1: Write failing test `backend/tests/services/lusha.test.js`**

```js
import nock from "nock";
import { searchLeads, enrichContact } from "../../services/lusha.js";

const BASE = "https://api.lusha.com";

afterEach(() => nock.cleanAll());

describe("lusha service", () => {
  test("searchLeads returns normalized leads", async () => {
    nock(BASE).post("/prospecting/search").reply(200, {
      data: [{
        id: "p1", firstName: "Alice", lastName: "Smith",
        jobTitle: "Head of Engineering", companyName: "Acme",
        location: { country: "India" }, linkedinUrl: "https://linkedin.com/in/alice",
        department: "Engineering", seniority: "Director"
      }],
      total: 1
    });

    const leads = await searchLeads({ titles: ["Head of Engineering"], locations: ["India"] });
    expect(leads).toHaveLength(1);
    expect(leads[0].firstName).toBe("Alice");
    expect(leads[0].lushaPersonId).toBe("p1");
  });

  test("retries on 429 with backoff", async () => {
    nock(BASE).post("/prospecting/search").reply(429, { error: "rate_limited" });
    nock(BASE).post("/prospecting/search").reply(200, { data: [], total: 0 });
    const leads = await searchLeads({ titles: ["CTO"] }, { retryDelayMs: 10 });
    expect(leads).toEqual([]);
  });

  test("enrichContact returns email and phone", async () => {
    nock(BASE).get("/prospecting/contact/p1").reply(200, {
      data: { email: "alice@acme.com", phoneNumber: "+911234567890" }
    });
    const contact = await enrichContact("p1");
    expect(contact.email).toBe("alice@acme.com");
    expect(contact.phone).toBe("+911234567890");
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/services/lusha.js`**

```js
import { env } from "../config/env.js";

const BASE = "https://api.lusha.com";

function headers() {
  return {
    "Content-Type": "application/json",
    "api_key": env.LUSHA_API_KEY || "test-key"
  };
}

async function requestWithRetry(url, init, { retries = 3, retryDelayMs = 1000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    if (attempt === retries) return res;
    const wait = retryDelayMs * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, wait));
  }
}

function normalize(p) {
  return {
    lushaPersonId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    title: p.jobTitle,
    company: p.companyName,
    location: p.location?.country || p.location?.city || null,
    linkedinUrl: p.linkedinUrl,
    department: p.department,
    seniority: p.seniority
  };
}

export async function searchLeads(filters, opts = {}) {
  const res = await requestWithRetry(`${BASE}/prospecting/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ filters, pages: { page: 0, size: 50 } })
  }, opts);
  if (!res.ok) throw new Error(`lusha_search_failed_${res.status}`);
  const json = await res.json();
  return (json.data || []).map(normalize);
}

export async function enrichContact(lushaPersonId, opts = {}) {
  const res = await requestWithRetry(`${BASE}/prospecting/contact/${lushaPersonId}`, {
    method: "GET",
    headers: headers()
  }, opts);
  if (!res.ok) throw new Error(`lusha_enrich_failed_${res.status}`);
  const json = await res.json();
  return { email: json.data?.email || null, phone: json.data?.phoneNumber || null };
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add Lusha service with 429 backoff"
```

---

### Task 4.2: fetchLeads worker + campaign run endpoint

**Files:**
- Create: `backend/workers/fetchLeads.js`, `backend/tests/workers/fetchLeads.test.js`
- Modify: `backend/workers/index.js`, `backend/routes/campaigns.js`

- [ ] **Step 1: Write failing test `backend/tests/workers/fetchLeads.test.js`**

```js
import { jest } from "@jest/globals";
import { runFetchLeadsJob } from "../../workers/fetchLeads.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

jest.unstable_mockModule("../../services/lusha.js", () => ({
  searchLeads: jest.fn().mockResolvedValue([
    { lushaPersonId: "p1", firstName: "A", lastName: "B", title: "CTO", company: "Acme" },
    { lushaPersonId: "p2", firstName: "C", lastName: "D", title: "VP Eng", company: "Beta" }
  ]),
  enrichContact: jest.fn().mockImplementation((id) => Promise.resolve({ email: `${id}@x.com`, phone: null }))
}));

beforeEach(async () => { await resetDb(); });

describe("fetchLeads worker", () => {
  test("stores leads and sets campaign RUNNING", async () => {
    const { user } = await createUser({ role: "MANAGER" });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: { titles: ["CTO"] }, createdById: user.id }
    });
    await runFetchLeadsJob({ data: { campaignId: campaign.id } });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(2);
    expect(leads[0].email).toMatch(/@x.com/);
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("zero leads → campaign COMPLETED", async () => {
    const { searchLeads } = await import("../../services/lusha.js");
    searchLeads.mockResolvedValueOnce([]);
    const { user } = await createUser({ role: "MANAGER", email: "m2@x.com" });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    await runFetchLeadsJob({ data: { campaignId: campaign.id } });
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("COMPLETED");
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/workers/fetchLeads.js`**

```js
import { prisma } from "../lib/prisma.js";
import { searchLeads, enrichContact } from "../services/lusha.js";
import { logger } from "../lib/logger.js";
import { getBoss } from "../lib/pgboss.js";

export const QUEUE = "fetch-leads";

export async function runFetchLeadsJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  const results = await searchLeads(campaign.extractedFilters);
  logger.info(`fetch-leads: ${results.length} results for campaign ${campaignId}`);

  if (results.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    return { leadCount: 0 };
  }

  for (const r of results) {
    const enriched = await enrichContact(r.lushaPersonId);
    await prisma.lead.create({
      data: {
        lushaPersonId: r.lushaPersonId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: enriched.email,
        title: r.title,
        company: r.company,
        location: r.location,
        linkedinUrl: r.linkedinUrl,
        department: r.department,
        seniority: r.seniority,
        campaignId
      }
    });
  }

  // Enqueue email generation for each lead with an email
  const boss = await getBoss();
  const leads = await prisma.lead.findMany({ where: { campaignId, email: { not: null } } });
  for (const lead of leads) {
    await boss.send("generate-email", { leadId: lead.id });
  }
  return { leadCount: leads.length };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 1, teamConcurrency: 1 }, runFetchLeadsJob);
}
```

- [ ] **Step 4: Update `backend/workers/index.js`**

```js
import { getBoss } from "../lib/pgboss.js";
import { logger } from "../lib/logger.js";
import * as fetchLeads from "./fetchLeads.js";

export async function registerWorkers() {
  const boss = await getBoss();
  await fetchLeads.register(boss);
  logger.info("workers registered");
  return boss;
}
```

- [ ] **Step 5: Add POST /api/campaigns/:id/run to `backend/routes/campaigns.js`**

```js
import { getBoss } from "../lib/pgboss.js";
// ...
router.post("/:id/run", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status === "RUNNING") return res.status(409).json({ error: "already_running" });
    const boss = await getBoss();
    const jobId = await boss.send("fetch-leads", { campaignId: campaign.id });
    res.json({ jobId });
  } catch (e) { next(e); }
});

router.patch("/:id/pause", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id }, data: { status: "PAUSED" }
    });
    res.json({ campaign });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
    next(e);
  }
});
```

- [ ] **Step 6: Run — verify PASS**

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add fetch-leads worker and run/pause endpoints"
```

---

### Task 4.3: Leads routes + pages

**Files:**
- Create: `backend/routes/leads.js`, `backend/tests/routes/leads.test.js`, `frontend/src/app/(app)/leads/page.jsx`, `frontend/src/app/(app)/leads/[id]/page.jsx`, `frontend/src/components/LeadTable.jsx`, `frontend/src/components/JobProgressBar.jsx`
- Modify: `backend/app.js`, `frontend/src/app/(app)/campaigns/[id]/page.jsx`

- [ ] **Step 1: Write failing test `backend/tests/routes/leads.test.js`**

```js
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

const app = createApp();
beforeEach(async () => { await resetDb(); });

async function seedLead(extra = {}) {
  const { user } = await createUser({ email: `u${Date.now()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  return prisma.lead.create({
    data: {
      firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme",
      email: "alice@acme.com", campaignId: campaign.id, ...extra
    }
  });
}

describe("leads routes", () => {
  test("GET /api/leads lists leads", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v@x.com" });
    await seedLead();
    const res = await request(app).get("/api/leads").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.leads.length).toBeGreaterThan(0);
  });

  test("GET /api/leads filters by campaign", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v2@x.com" });
    const lead = await seedLead();
    const res = await request(app).get(`/api/leads?campaignId=${lead.campaignId}`).set(authHeader(token));
    expect(res.body.leads).toHaveLength(1);
  });

  test("PATCH /api/leads/:id updates status (manager)", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "m@x.com" });
    const lead = await seedLead();
    const res = await request(app).patch(`/api/leads/${lead.id}`)
      .set(authHeader(token))
      .send({ status: "INTERESTED" });
    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe("INTERESTED");
  });

  test("PATCH /api/leads/:id forbidden for viewer", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v3@x.com" });
    const lead = await seedLead();
    const res = await request(app).patch(`/api/leads/${lead.id}`)
      .set(authHeader(token))
      .send({ status: "INTERESTED" });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/routes/leads.js`**

```js
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { campaignId, status, sentiment } = req.query;
    const where = {};
    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;
    const leads = await prisma.lead.findMany({
      where,
      include: { _count: { select: { emails: true, replies: true } } },
      orderBy: { createdAt: "desc" },
      take: 500
    });
    const filtered = sentiment
      ? leads.filter((l) => l._count.replies > 0) // broader filter implemented on replies route
      : leads;
    res.json({ leads: filtered });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { emails: { orderBy: { createdAt: "desc" } }, replies: { orderBy: { receivedAt: "desc" } } }
    });
    if (!lead) return res.status(404).json({ error: "not_found" });
    res.json({ lead });
  } catch (e) { next(e); }
});

const patchSchema = z.object({
  status: z.enum(["NEW","CONTACTED","REPLIED","INTERESTED","NOT_INTERESTED","NEUTRAL","CONVERTIBLE","SKIPPED"]).optional()
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: parsed.data });
    res.json({ lead });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;
```

- [ ] **Step 4: Wire in `backend/app.js`**

```js
import leadsRouter from "./routes/leads.js";
// ...
app.use("/api/leads", leadsRouter);
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Create `frontend/src/components/LeadTable.jsx`**

```jsx
import Link from "next/link";

export default function LeadTable({ leads }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left border-b">
        <th>Name</th><th>Title</th><th>Company</th><th>Email</th><th>Status</th>
      </tr></thead>
      <tbody>
        {leads.map((l) => (
          <tr key={l.id} className="border-b hover:bg-gray-50">
            <td className="py-2"><Link className="underline" href={`/leads/${l.id}`}>{l.firstName} {l.lastName}</Link></td>
            <td>{l.title}</td>
            <td>{l.company}</td>
            <td>{l.email}</td>
            <td>{l.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 7: Create `frontend/src/components/JobProgressBar.jsx`**

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function JobProgressBar({ jobId }) {
  const { data: session } = useSession();
  const [job, setJob] = useState(null);

  useEffect(() => {
    if (!jobId || !session?.backendToken) return;
    let cancelled = false;
    async function poll() {
      try {
        const { job } = await apiFetch(`/api/jobs/${jobId}`, { token: session.backendToken });
        if (cancelled) return;
        setJob(job);
        if (job.state !== "completed" && job.state !== "failed") setTimeout(poll, 2000);
      } catch { /* ignore */ }
    }
    poll();
    return () => { cancelled = true; };
  }, [jobId, session?.backendToken]);

  if (!job) return <p className="text-sm text-gray-500">Queuing…</p>;
  return (
    <div className="text-sm">
      <span>Job {job.name}: </span>
      <span className="font-semibold">{job.state}</span>
      {job.retryCount > 0 && <span className="text-amber-700"> (retry {job.retryCount})</span>}
    </div>
  );
}
```

- [ ] **Step 8: Create `frontend/src/app/(app)/leads/page.jsx`**

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import LeadTable from "@/components/LeadTable";

export default function LeadsPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch("/api/leads", { token: session.backendToken }).then(({ leads }) => setLeads(leads));
  }, [session?.backendToken]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Leads</h1>
      <LeadTable leads={leads} />
    </div>
  );
}
```

- [ ] **Step 9: Create `frontend/src/app/(app)/leads/[id]/page.jsx`** (will be extended in Phase 5)

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function LeadDetailPage({ params }) {
  const { data: session } = useSession();
  const [lead, setLead] = useState(null);

  useEffect(() => {
    if (!session?.backendToken) return;
    apiFetch(`/api/leads/${params.id}`, { token: session.backendToken }).then(({ lead }) => setLead(lead));
  }, [session?.backendToken, params.id]);

  if (!lead) return <p>Loading...</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{lead.firstName} {lead.lastName}</h1>
      <p className="text-sm">{lead.title} · {lead.company}</p>
      <p className="text-sm">{lead.email}</p>
      <p className="text-sm">Status: {lead.status}</p>
    </div>
  );
}
```

- [ ] **Step 10: Update campaign detail page to add Run button** — replace `frontend/src/app/(app)/campaigns/[id]/page.jsx` body with a version that adds:

```jsx
import JobProgressBar from "@/components/JobProgressBar";
// inside component add state `const [jobId, setJobId] = useState(null);`
async function onRun() {
  const { jobId } = await apiFetch(`/api/campaigns/${campaign.id}/run`, {
    token: session.backendToken, method: "POST"
  });
  setJobId(jobId);
}
// render: <button onClick={onRun} className="bg-black text-white px-3 py-2 rounded text-sm">Run campaign</button>
// render: {jobId && <JobProgressBar jobId={jobId} />}
```

- [ ] **Step 11: Commit**

```bash
git add backend/ frontend/ && git commit -m "feat: add leads routes, table, detail page, and campaign run button"
```

---

## Phase 5 — Gemini Email Generation Worker

### Task 5.1: emailGen service

**Files:**
- Create: `backend/services/emailGen.js`, `backend/tests/services/emailGen.test.js`

- [ ] **Step 1: Write failing test**

```js
import { jest } from "@jest/globals";
import { generateDraft } from "../../services/emailGen.js";

describe("emailGen", () => {
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
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/services/emailGen.js`**

```js
import { generateJson } from "./gemini.js";

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

export async function generateDraft(lead, profile, { generate = generateJson } = {}) {
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
  return generate(prompt);
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add emailGen Gemini service"
```

---

### Task 5.2: generateEmail worker + chaining to dispatch

**Files:**
- Create: `backend/workers/generateEmail.js`, `backend/tests/workers/generateEmail.test.js`
- Modify: `backend/workers/index.js`

- [ ] **Step 1: Write failing test**

```js
import { jest } from "@jest/globals";
import { runGenerateEmailJob } from "../../workers/generateEmail.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

jest.unstable_mockModule("../../services/emailGen.js", () => ({
  generateDraft: jest.fn().mockResolvedValue({
    subject: "Test subject", body: "Hi there,\nTest body."
  })
}));

beforeEach(async () => { await resetDb(); });

describe("generateEmail worker", () => {
  test("creates Email row linked to lead", async () => {
    const { user } = await createUser();
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", title: "CTO", company: "Acme", campaignId: campaign.id }
    });
    await runGenerateEmailJob({ data: { leadId: lead.id } });
    const emails = await prisma.email.findMany({ where: { leadId: lead.id } });
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe("Test subject");
    expect(emails[0].status).toBe("DRAFT");
    expect(emails[0].version).toBe(1);
  });

  test("bumps version on regeneration", async () => {
    const { user } = await createUser({ email: "u2@x.com" });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
    });
    await runGenerateEmailJob({ data: { leadId: lead.id } });
    await runGenerateEmailJob({ data: { leadId: lead.id } });
    const emails = await prisma.email.findMany({ where: { leadId: lead.id }, orderBy: { version: "asc" } });
    expect(emails).toHaveLength(2);
    expect(emails[1].version).toBe(2);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/workers/generateEmail.js`**

```js
import { prisma } from "../lib/prisma.js";
import { generateDraft } from "../services/emailGen.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "generate-email";

// TODO: load from a SenderProfile table (Phase 9) — using constant for now
const DEFAULT_PROFILE = {
  senderName: "Outreach Team",
  senderCompany: "NST",
  valueProp: "NST students build production-grade systems and are job-ready"
};

export async function runGenerateEmailJob(job) {
  const { leadId } = job.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`lead ${leadId} not found`);

  const draft = await generateDraft(lead, DEFAULT_PROFILE);
  const latest = await prisma.email.findFirst({ where: { leadId }, orderBy: { version: "desc" } });
  const version = latest ? latest.version + 1 : 1;

  const email = await prisma.email.create({
    data: {
      leadId,
      subject: draft.subject,
      body: draft.body,
      version,
      status: "DRAFT"
    }
  });
  logger.info(`generated email v${version} for lead ${leadId}`);
  return { emailId: email.id, version };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 5, teamConcurrency: 5 }, runGenerateEmailJob);
}
```

- [ ] **Step 4: Update `backend/workers/index.js`**

```js
import { getBoss } from "../lib/pgboss.js";
import { logger } from "../lib/logger.js";
import * as fetchLeads from "./fetchLeads.js";
import * as generateEmail from "./generateEmail.js";

export async function registerWorkers() {
  const boss = await getBoss();
  await fetchLeads.register(boss);
  await generateEmail.register(boss);
  logger.info("workers registered");
  return boss;
}
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add generate-email worker"
```

---

### Task 5.3: Email routes (list/generate/regenerate/send)

**Files:**
- Create: `backend/routes/emails.js`, `backend/tests/routes/emails.test.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Write failing test `backend/tests/routes/emails.test.js`**

```js
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

const app = createApp();
beforeEach(async () => { await resetDb(); });

async function seedLeadWithEmail() {
  const { user } = await createUser({ email: `u${Date.now()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  const lead = await prisma.lead.create({
    data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
  });
  const email = await prisma.email.create({
    data: { leadId: lead.id, subject: "Hi", body: "Body", version: 1 }
  });
  return { user, campaign, lead, email };
}

describe("email routes", () => {
  test("GET /api/leads/:id/emails returns history", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v@x.com" });
    const { lead } = await seedLeadWithEmail();
    const res = await request(app).get(`/api/leads/${lead.id}/emails`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.emails).toHaveLength(1);
  });

  test("POST /api/leads/:id/emails enqueues generate-email (manager)", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "m@x.com" });
    const { lead } = await seedLeadWithEmail();
    const res = await request(app).post(`/api/leads/${lead.id}/emails`).set(authHeader(token));
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
  });

  test("POST /api/emails/:id/regenerate enqueues (manager)", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "m2@x.com" });
    const { email } = await seedLeadWithEmail();
    const res = await request(app).post(`/api/emails/${email.id}/regenerate`).set(authHeader(token));
    expect(res.status).toBe(202);
  });

  test("POST /api/emails/:id/regenerate forbidden for viewer", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v2@x.com" });
    const { email } = await seedLeadWithEmail();
    const res = await request(app).post(`/api/emails/${email.id}/regenerate`).set(authHeader(token));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/routes/emails.js`**

```js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { getBoss } from "../lib/pgboss.js";

const router = Router();
router.use(requireAuth);

// mounted at /api for mixed route prefixes
router.get("/leads/:id/emails", async (req, res, next) => {
  try {
    const emails = await prisma.email.findMany({
      where: { leadId: req.params.id },
      orderBy: { version: "desc" }
    });
    res.json({ emails });
  } catch (e) { next(e); }
});

router.post("/leads/:id/emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: "not_found" });
    const boss = await getBoss();
    const jobId = await boss.send("generate-email", { leadId: lead.id });
    res.status(202).json({ jobId });
  } catch (e) { next(e); }
});

router.post("/emails/:id/regenerate", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const email = await prisma.email.findUnique({ where: { id: req.params.id } });
    if (!email) return res.status(404).json({ error: "not_found" });
    const boss = await getBoss();
    const jobId = await boss.send("generate-email", { leadId: email.leadId });
    res.status(202).json({ jobId });
  } catch (e) { next(e); }
});

router.post("/emails/:id/send", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const email = await prisma.email.findUnique({ where: { id: req.params.id }, include: { lead: true } });
    if (!email) return res.status(404).json({ error: "not_found" });
    // Actual sending happens via dispatchCampaign; for single-lead approval we mark SENT.
    // In Phase 6 this will call instantly.sendSingle(). For now, mark sent so UI is unblocked.
    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { status: "SENT", sentAt: new Date() }
    });
    await prisma.lead.update({ where: { id: email.leadId }, data: { status: "CONTACTED" } });
    res.json({ email: updated });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Wire in `backend/app.js`**

```js
import emailsRouter from "./routes/emails.js";
// ...
app.use("/api", emailsRouter);
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add email list/generate/regenerate/send routes"
```

---

### Task 5.4: EmailDraftPanel component + lead detail extension

**Files:**
- Create: `frontend/src/components/EmailDraftPanel.jsx`
- Modify: `frontend/src/app/(app)/leads/[id]/page.jsx`

- [ ] **Step 1: Create `frontend/src/components/EmailDraftPanel.jsx`**

```jsx
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function EmailDraftPanel({ leadId, emails: initial, onRefresh }) {
  const { data: session } = useSession();
  const [emails, setEmails] = useState(initial);
  const [busy, setBusy] = useState(false);
  const token = session?.backendToken;

  async function reload() {
    const { emails } = await apiFetch(`/api/leads/${leadId}/emails`, { token });
    setEmails(emails);
    onRefresh?.();
  }

  async function generate() {
    setBusy(true);
    try {
      await apiFetch(`/api/leads/${leadId}/emails`, { token, method: "POST" });
      setTimeout(reload, 2000);
    } finally { setBusy(false); }
  }

  async function regenerate(id) {
    setBusy(true);
    try {
      await apiFetch(`/api/emails/${id}/regenerate`, { token, method: "POST" });
      setTimeout(reload, 2000);
    } finally { setBusy(false); }
  }

  async function send(id) {
    setBusy(true);
    try {
      await apiFetch(`/api/emails/${id}/send`, { token, method: "POST" });
      reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">Emails</h2>
        <button disabled={busy} onClick={generate} className="bg-black text-white px-3 py-1 rounded text-sm">
          {busy ? "Working…" : "Generate draft"}
        </button>
      </div>
      {emails.length === 0 && <p className="text-sm text-gray-500">No drafts yet.</p>}
      {emails.map((e) => (
        <div key={e.id} className="border rounded p-3 space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>v{e.version} · {e.status}</span>
            <span>{new Date(e.createdAt).toLocaleString()}</span>
          </div>
          <div className="font-semibold">{e.subject}</div>
          <pre className="whitespace-pre-wrap text-sm">{e.body}</pre>
          {e.status === "DRAFT" && (
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => regenerate(e.id)} className="text-sm underline">Regenerate</button>
              <button disabled={busy} onClick={() => send(e.id)} className="text-sm bg-green-600 text-white px-3 py-1 rounded">Send</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/app/(app)/leads/[id]/page.jsx`**

```jsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import EmailDraftPanel from "@/components/EmailDraftPanel";

export default function LeadDetailPage({ params }) {
  const { data: session } = useSession();
  const [lead, setLead] = useState(null);

  const load = useCallback(async () => {
    if (!session?.backendToken) return;
    const { lead } = await apiFetch(`/api/leads/${params.id}`, { token: session.backendToken });
    setLead(lead);
  }, [session?.backendToken, params.id]);

  useEffect(() => { load(); }, [load]);

  if (!lead) return <p>Loading...</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{lead.firstName} {lead.lastName}</h1>
        <p className="text-sm text-gray-600">{lead.title} · {lead.company}</p>
        <p className="text-sm">{lead.email}</p>
        <p className="text-sm">Status: <span className="font-semibold">{lead.status}</span></p>
      </div>
      <EmailDraftPanel leadId={lead.id} emails={lead.emails || []} onRefresh={load} />
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke test** — open a lead, click Generate draft, wait, confirm email appears.

- [ ] **Step 4: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): add EmailDraftPanel and wire to lead detail"
```

---

## Phase 6 — Instantly.ai Dispatch

### Task 6.1: instantly.js service

**Files:**
- Create: `backend/services/instantly.js`, `backend/tests/services/instantly.test.js`

- [ ] **Step 1: Write failing test**

```js
import nock from "nock";
import { createCampaign, pushLeads, sendSubsequence } from "../../services/instantly.js";

const BASE = "https://api.instantly.ai";

afterEach(() => nock.cleanAll());

describe("instantly service", () => {
  test("createCampaign returns id", async () => {
    nock(BASE).post("/api/v2/campaigns").reply(200, { id: "cmp_123", name: "X" });
    const out = await createCampaign("X");
    expect(out.instantlyCampaignId).toBe("cmp_123");
  });

  test("pushLeads reports accepted and rejected", async () => {
    nock(BASE).post("/api/v2/leads").reply(200, {
      accepted: 2, rejected: [{ email: "bad@x.com", reason: "invalid" }]
    });
    const out = await pushLeads("cmp_123", [
      { email: "a@x.com", firstName: "A", lastName: "B", subject: "S", body: "B" },
      { email: "c@x.com", firstName: "C", lastName: "D", subject: "S", body: "B" },
      { email: "bad@x.com", firstName: "X", lastName: "Y", subject: "S", body: "B" }
    ]);
    expect(out.accepted).toBe(2);
    expect(out.rejected).toHaveLength(1);
  });

  test("sendSubsequence calls subsequence endpoint", async () => {
    nock(BASE).post("/api/v2/campaigns/cmp_123/subsequences").reply(200, { ok: true });
    await expect(sendSubsequence("cmp_123", "lead@x.com", "follow-up body")).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/services/instantly.js`**

```js
import { env } from "../config/env.js";

const BASE = "https://api.instantly.ai";

function headers() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${env.INSTANTLY_API_KEY || "test-key"}`
  };
}

async function req(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`instantly_${method}_${path}_${res.status}`);
  return res.json();
}

export async function createCampaign(name) {
  const json = await req("/api/v2/campaigns", "POST", { name });
  return { instantlyCampaignId: json.id };
}

export async function pushLeads(instantlyCampaignId, leads) {
  const payload = {
    campaign_id: instantlyCampaignId,
    leads: leads.map((l) => ({
      email: l.email,
      first_name: l.firstName,
      last_name: l.lastName,
      company_name: l.company,
      personalization: l.body,
      custom_variables: { subject: l.subject, body: l.body }
    }))
  };
  const json = await req("/api/v2/leads", "POST", payload);
  return { accepted: json.accepted || 0, rejected: json.rejected || [] };
}

export async function sendSubsequence(instantlyCampaignId, leadEmail, body) {
  await req(`/api/v2/campaigns/${instantlyCampaignId}/subsequences`, "POST", {
    lead_email: leadEmail,
    body
  });
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add Instantly.ai service"
```

---

### Task 6.2: dispatchCampaign worker + pipeline chaining

**Files:**
- Create: `backend/workers/dispatchCampaign.js`, `backend/tests/workers/dispatchCampaign.test.js`
- Modify: `backend/workers/generateEmail.js`, `backend/workers/index.js`

- [ ] **Step 1: Write failing test `backend/tests/workers/dispatchCampaign.test.js`**

```js
import { jest } from "@jest/globals";
import { runDispatchJob } from "../../workers/dispatchCampaign.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

jest.unstable_mockModule("../../services/instantly.js", () => ({
  createCampaign: jest.fn().mockResolvedValue({ instantlyCampaignId: "cmp_abc" }),
  pushLeads: jest.fn().mockResolvedValue({ accepted: 2, rejected: [] }),
  sendSubsequence: jest.fn()
}));

beforeEach(async () => { await resetDb(); });

describe("dispatchCampaign worker", () => {
  test("creates Instantly campaign and pushes leads with drafts", async () => {
    const { user } = await createUser();
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    for (const i of [1, 2]) {
      const lead = await prisma.lead.create({
        data: {
          firstName: `A${i}`, lastName: "B", email: `a${i}@x.com`,
          title: "CTO", company: "Acme", campaignId: campaign.id
        }
      });
      await prisma.email.create({
        data: { leadId: lead.id, subject: `S${i}`, body: `B${i}`, version: 1 }
      });
    }
    await runDispatchJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.instantlyCampaignId).toBe("cmp_abc");
    expect(updated.status).toBe("RUNNING");

    const sentEmails = await prisma.email.findMany({ where: { status: "SENT" } });
    expect(sentEmails).toHaveLength(2);

    const contactedLeads = await prisma.lead.findMany({ where: { status: "CONTACTED" } });
    expect(contactedLeads).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/workers/dispatchCampaign.js`**

```js
import { prisma } from "../lib/prisma.js";
import { createCampaign, pushLeads } from "../services/instantly.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "dispatch-to-instantly";

export async function runDispatchJob(job) {
  const { campaignId } = job.data;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);

  let instantlyCampaignId = campaign.instantlyCampaignId;
  if (!instantlyCampaignId) {
    const out = await createCampaign(campaign.name);
    instantlyCampaignId = out.instantlyCampaignId;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { instantlyCampaignId, status: "RUNNING" }
    });
  }

  // Pull latest-version draft email per lead
  const leads = await prisma.lead.findMany({
    where: { campaignId, email: { not: null } },
    include: { emails: { orderBy: { version: "desc" }, take: 1 } }
  });

  const payload = leads
    .filter((l) => l.emails.length > 0 && l.emails[0].status === "DRAFT")
    .map((l) => ({
      email: l.email,
      firstName: l.firstName,
      lastName: l.lastName,
      company: l.company,
      subject: l.emails[0].subject,
      body: l.emails[0].body,
      _leadId: l.id,
      _emailId: l.emails[0].id
    }));

  if (payload.length === 0) {
    logger.warn(`dispatch: no draft emails for campaign ${campaignId}`);
    return { accepted: 0, rejected: 0 };
  }

  const result = await pushLeads(instantlyCampaignId, payload);
  const rejectedEmails = new Set((result.rejected || []).map((r) => r.email));

  for (const p of payload) {
    if (rejectedEmails.has(p.email)) {
      await prisma.email.update({ where: { id: p._emailId }, data: { status: "FAILED" } });
    } else {
      await prisma.email.update({
        where: { id: p._emailId },
        data: { status: "SENT", sentAt: new Date() }
      });
      await prisma.lead.update({ where: { id: p._leadId }, data: { status: "CONTACTED" } });
    }
  }
  logger.info(`dispatch: campaign=${campaignId} accepted=${result.accepted} rejected=${(result.rejected || []).length}`);
  return { accepted: result.accepted, rejected: (result.rejected || []).length };
}

export async function register(boss) {
  await boss.work(QUEUE, runDispatchJob);
}
```

- [ ] **Step 4: Chain generate-email completion to dispatch** — Update `backend/workers/generateEmail.js` to trigger dispatch when all leads for a campaign have a draft. Replace file with:

```js
import { prisma } from "../lib/prisma.js";
import { generateDraft } from "../services/emailGen.js";
import { logger } from "../lib/logger.js";
import { getBoss } from "../lib/pgboss.js";

export const QUEUE = "generate-email";

const DEFAULT_PROFILE = {
  senderName: "Outreach Team",
  senderCompany: "NST",
  valueProp: "NST students build production-grade systems and are job-ready"
};

export async function runGenerateEmailJob(job) {
  const { leadId } = job.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`lead ${leadId} not found`);

  const draft = await generateDraft(lead, DEFAULT_PROFILE);
  const latest = await prisma.email.findFirst({ where: { leadId }, orderBy: { version: "desc" } });
  const version = latest ? latest.version + 1 : 1;

  const email = await prisma.email.create({
    data: { leadId, subject: draft.subject, body: draft.body, version, status: "DRAFT" }
  });
  logger.info(`generated email v${version} for lead ${leadId}`);

  // Check if all leads in this campaign have at least one draft email → enqueue dispatch
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

  return { emailId: email.id, version };
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 5, teamConcurrency: 5 }, runGenerateEmailJob);
}
```

- [ ] **Step 5: Register dispatch worker in `backend/workers/index.js`**

```js
import { getBoss } from "../lib/pgboss.js";
import { logger } from "../lib/logger.js";
import * as fetchLeads from "./fetchLeads.js";
import * as generateEmail from "./generateEmail.js";
import * as dispatchCampaign from "./dispatchCampaign.js";

export async function registerWorkers() {
  const boss = await getBoss();
  await fetchLeads.register(boss);
  await generateEmail.register(boss);
  await dispatchCampaign.register(boss);
  logger.info("workers registered");
  return boss;
}
```

- [ ] **Step 6: Run — verify PASS**

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add dispatch worker and pipeline chaining"
```

---

## Phase 7 — Reply Webhook + Classification + Follow-up Drafting

### Task 7.1: replyHandler service

**Files:**
- Create: `backend/services/replyHandler.js`, `backend/tests/services/replyHandler.test.js`

- [ ] **Step 1: Write failing test**

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
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/services/replyHandler.js`**

```js
import { generateJson } from "./gemini.js";

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

const FOLLOWUP_PROMPT = `Draft a brief, warm follow-up email. 60 words or less. Plain text. No em-dashes.

Sentiment context guides tone:
- INTERESTED → propose 2 concrete meeting times
- NOT_INTERESTED → polite acknowledgment, leave door open
- NEUTRAL → answer their question and re-propose a call
- CONVERTIBLE → confirm future timing or redirect gracefully

Return JSON: { "followUp": string }`;

export async function draftFollowUp(replyBody, lead, sentiment, { generate = generateJson } = {}) {
  const prompt = `${FOLLOWUP_PROMPT}

Reply from ${lead.firstName}:
${replyBody}

Sentiment: ${sentiment}

JSON:`;
  const out = await generate(prompt);
  return out.followUp;
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add replyHandler service"
```

---

### Task 7.2: processReply worker

**Files:**
- Create: `backend/workers/processReply.js`, `backend/tests/workers/processReply.test.js`
- Modify: `backend/workers/index.js`

- [ ] **Step 1: Write failing test**

```js
import { jest } from "@jest/globals";
import { runProcessReplyJob } from "../../workers/processReply.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

jest.unstable_mockModule("../../services/replyHandler.js", () => ({
  classifySentiment: jest.fn().mockResolvedValue("INTERESTED"),
  draftFollowUp: jest.fn().mockResolvedValue("Great, here are 2 times...")
}));

beforeEach(async () => { await resetDb(); });

describe("processReply worker", () => {
  test("stores reply with sentiment and follow-up, updates lead", async () => {
    const { user } = await createUser();
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id, status: "CONTACTED" }
    });

    await runProcessReplyJob({ data: {
      leadEmail: "a@b.com",
      body: "Yes, I'm interested",
      receivedAt: "2026-04-11T10:00:00Z"
    }});

    const replies = await prisma.reply.findMany({ where: { leadId: lead.id } });
    expect(replies).toHaveLength(1);
    expect(replies[0].sentiment).toBe("INTERESTED");
    expect(replies[0].draftFollowUp).toMatch(/times/);

    const updated = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updated.status).toBe("INTERESTED");
  });

  test("idempotent on duplicate (same leadId + receivedAt)", async () => {
    const { user } = await createUser({ email: "u2@x.com" });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
    });
    const ts = "2026-04-11T10:00:00Z";
    await runProcessReplyJob({ data: { leadEmail: "a@b.com", body: "hi", receivedAt: ts } });
    await runProcessReplyJob({ data: { leadEmail: "a@b.com", body: "hi", receivedAt: ts } });
    const count = await prisma.reply.count();
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/workers/processReply.js`**

```js
import { prisma } from "../lib/prisma.js";
import { classifySentiment, draftFollowUp } from "../services/replyHandler.js";
import { logger } from "../lib/logger.js";

export const QUEUE = "process-reply";

const SENTIMENT_TO_STATUS = {
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  NEUTRAL: "NEUTRAL",
  CONVERTIBLE: "CONVERTIBLE"
};

export async function runProcessReplyJob(job) {
  const { leadEmail, body, receivedAt } = job.data;
  const lead = await prisma.lead.findFirst({ where: { email: leadEmail } });
  if (!lead) { logger.warn(`process-reply: no lead for ${leadEmail}`); return; }

  const receivedDate = new Date(receivedAt);

  // Idempotency: skip if reply already exists for (leadId, receivedAt)
  const existing = await prisma.reply.findUnique({
    where: { leadId_receivedAt: { leadId: lead.id, receivedAt: receivedDate } }
  });
  if (existing) { logger.info(`process-reply: duplicate skipped for lead ${lead.id}`); return; }

  const sentiment = await classifySentiment(body);
  const follow = await draftFollowUp(body, lead, sentiment);

  await prisma.reply.create({
    data: {
      leadId: lead.id,
      body,
      sentiment,
      draftFollowUp: follow,
      receivedAt: receivedDate
    }
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: SENTIMENT_TO_STATUS[sentiment] || "REPLIED" }
  });
}

export async function register(boss) {
  await boss.work(QUEUE, { teamSize: 3, teamConcurrency: 3 }, runProcessReplyJob);
}
```

- [ ] **Step 4: Update `backend/workers/index.js`**

```js
import * as processReply from "./processReply.js";
// ... inside registerWorkers, add:
await processReply.register(boss);
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add processReply worker with idempotency"
```

---

### Task 7.3: Webhook route with secret verification

**Files:**
- Create: `backend/routes/webhooks.js`, `backend/tests/routes/webhooks.test.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Write failing test**

```js
import request from "supertest";
import { createApp } from "../../app.js";

const app = createApp();

describe("POST /api/webhooks/instantly", () => {
  beforeAll(() => { process.env.INSTANTLY_WEBHOOK_SECRET = "test-secret"; });

  test("401 when secret missing", async () => {
    const res = await request(app).post("/api/webhooks/instantly")
      .send({ event: "reply_received", lead_email: "a@b.com", body: "hi", received_at: "2026-04-11T10:00:00Z" });
    expect(res.status).toBe(401);
  });

  test("401 when secret wrong", async () => {
    const res = await request(app).post("/api/webhooks/instantly")
      .set("X-Webhook-Secret", "wrong")
      .send({ event: "reply_received", lead_email: "a@b.com", body: "hi", received_at: "2026-04-11T10:00:00Z" });
    expect(res.status).toBe(401);
  });

  test("202 when secret matches and event is reply_received", async () => {
    const res = await request(app).post("/api/webhooks/instantly")
      .set("X-Webhook-Secret", "test-secret")
      .send({ event: "reply_received", lead_email: "a@b.com", body: "hi", received_at: "2026-04-11T10:00:00Z" });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();
  });

  test("200 and ignore non-reply events", async () => {
    const res = await request(app).post("/api/webhooks/instantly")
      .set("X-Webhook-Secret", "test-secret")
      .send({ event: "email_opened", lead_email: "a@b.com" });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/routes/webhooks.js`**

```js
import { Router } from "express";
import { getBoss } from "../lib/pgboss.js";

const router = Router();

router.post("/instantly", async (req, res, next) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    if (!secret || secret !== process.env.INSTANTLY_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const { event, lead_email, body, received_at } = req.body || {};
    if (event !== "reply_received") return res.json({ ok: true });

    const boss = await getBoss();
    const jobId = await boss.send("process-reply", {
      leadEmail: lead_email,
      body,
      receivedAt: received_at
    });
    res.status(202).json({ jobId });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Wire in `backend/app.js`**

```js
import webhooksRouter from "./routes/webhooks.js";
// ...
app.use("/api/webhooks", webhooksRouter);
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add Instantly webhook handler"
```

---

### Task 7.4: Replies routes + approve follow-up

**Files:**
- Create: `backend/routes/replies.js`, `backend/tests/routes/replies.test.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Write failing test**

```js
import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

jest.unstable_mockModule("../../services/instantly.js", () => ({
  sendSubsequence: jest.fn().mockResolvedValue(undefined),
  createCampaign: jest.fn(),
  pushLeads: jest.fn()
}));

const app = createApp();
beforeEach(async () => { await resetDb(); });

async function seedReply() {
  const { user } = await createUser({ email: `u${Date.now()}@x.com` });
  const campaign = await prisma.campaign.create({
    data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id, instantlyCampaignId: "cmp_abc" }
  });
  const lead = await prisma.lead.create({
    data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
  });
  return prisma.reply.create({
    data: {
      leadId: lead.id, body: "yes!", sentiment: "INTERESTED",
      draftFollowUp: "Great, how about Tue?", receivedAt: new Date()
    }
  });
}

describe("replies routes", () => {
  test("GET /api/replies lists", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v@x.com" });
    await seedReply();
    const res = await request(app).get("/api/replies").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.replies).toHaveLength(1);
  });

  test("GET /api/replies filters by sentiment", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v2@x.com" });
    await seedReply();
    const res = await request(app).get("/api/replies?sentiment=INTERESTED").set(authHeader(token));
    expect(res.body.replies).toHaveLength(1);
  });

  test("POST /api/replies/:id/approve sends via Instantly", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "m@x.com" });
    const reply = await seedReply();
    const res = await request(app).post(`/api/replies/${reply.id}/approve`).set(authHeader(token));
    expect(res.status).toBe(200);
    const { sendSubsequence } = await import("../../services/instantly.js");
    expect(sendSubsequence).toHaveBeenCalled();
  });

  test("POST approve forbidden for viewer", async () => {
    const { token } = await createUser({ role: "VIEWER", email: "v3@x.com" });
    const reply = await seedReply();
    const res = await request(app).post(`/api/replies/${reply.id}/approve`).set(authHeader(token));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/routes/replies.js`**

```js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { sendSubsequence } from "../services/instantly.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { sentiment, campaignId } = req.query;
    const where = {};
    if (sentiment) where.sentiment = sentiment;
    if (campaignId) where.lead = { campaignId };
    const replies = await prisma.reply.findMany({
      where,
      include: { lead: true },
      orderBy: { receivedAt: "desc" },
      take: 500
    });
    res.json({ replies });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const reply = await prisma.reply.findUnique({
      where: { id: req.params.id },
      include: { lead: { include: { campaign: true } } }
    });
    if (!reply) return res.status(404).json({ error: "not_found" });
    res.json({ reply });
  } catch (e) { next(e); }
});

router.post("/:id/approve", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const reply = await prisma.reply.findUnique({
      where: { id: req.params.id },
      include: { lead: { include: { campaign: true } } }
    });
    if (!reply) return res.status(404).json({ error: "not_found" });
    const { body } = req.body || {};
    const outgoing = body || reply.draftFollowUp;
    if (!outgoing) return res.status(400).json({ error: "missing_body" });
    const cmpId = reply.lead.campaign.instantlyCampaignId;
    if (!cmpId) return res.status(409).json({ error: "campaign_not_dispatched" });
    await sendSubsequence(cmpId, reply.lead.email, outgoing);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Wire in `backend/app.js`**

```js
import repliesRouter from "./routes/replies.js";
// ...
app.use("/api/replies", repliesRouter);
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add replies routes and follow-up approval"
```

---

### Task 7.5: Replies page, ReplyCard, SentimentBadge

**Files:**
- Create: `frontend/src/components/SentimentBadge.jsx`, `frontend/src/components/ReplyCard.jsx`, `frontend/src/app/(app)/replies/page.jsx`

- [ ] **Step 1: Create `frontend/src/components/SentimentBadge.jsx`**

```jsx
const COLORS = {
  INTERESTED: "bg-green-100 text-green-800",
  NOT_INTERESTED: "bg-red-100 text-red-800",
  NEUTRAL: "bg-gray-100 text-gray-800",
  CONVERTIBLE: "bg-blue-100 text-blue-800"
};

export default function SentimentBadge({ sentiment }) {
  if (!sentiment) return null;
  return (
    <span className={`text-xs px-2 py-1 rounded ${COLORS[sentiment] || COLORS.NEUTRAL}`}>
      {sentiment}
    </span>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/ReplyCard.jsx`**

```jsx
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import SentimentBadge from "./SentimentBadge";

export default function ReplyCard({ reply, onApproved }) {
  const { data: session } = useSession();
  const [body, setBody] = useState(reply.draftFollowUp || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/replies/${reply.id}/approve`, {
        token: session.backendToken, method: "POST", body: { body }
      });
      onApproved?.(reply.id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <div className="font-semibold">{reply.lead.firstName} {reply.lead.lastName}</div>
          <div className="text-xs text-gray-500">{reply.lead.company} · {new Date(reply.receivedAt).toLocaleString()}</div>
        </div>
        <SentimentBadge sentiment={reply.sentiment} />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Reply</div>
        <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded">{reply.body}</pre>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Draft follow-up</div>
        <textarea className="w-full border p-2 rounded text-sm h-24" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button disabled={busy || !body.trim()} onClick={approve} className="bg-green-600 text-white px-3 py-1 rounded text-sm">
        {busy ? "Sending…" : "Approve & send"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/(app)/replies/page.jsx`**

```jsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import ReplyCard from "@/components/ReplyCard";

export default function RepliesPage() {
  const { data: session } = useSession();
  const [replies, setReplies] = useState([]);
  const [filter, setFilter] = useState("");

  async function load() {
    if (!session?.backendToken) return;
    const q = filter ? `?sentiment=${filter}` : "";
    const { replies } = await apiFetch(`/api/replies${q}`, { token: session.backendToken });
    setReplies(replies);
  }
  useEffect(() => { load(); }, [session?.backendToken, filter]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-xl font-bold">Replies</h1>
        <select className="border rounded p-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="INTERESTED">Interested</option>
          <option value="NOT_INTERESTED">Not interested</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="CONVERTIBLE">Convertible</option>
        </select>
      </div>
      <div className="space-y-4">
        {replies.map((r) => <ReplyCard key={r.id} reply={r} onApproved={() => load()} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual smoke test** — simulate a webhook via curl, confirm reply appears in UI and can be approved.

- [ ] **Step 5: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): add replies page, ReplyCard, SentimentBadge"
```

---

## Phase 8 — Export to .xlsx

### Task 8.1: export service

**Files:**
- Create: `backend/services/export.js`, `backend/tests/services/export.test.js`

- [ ] **Step 1: Write failing test**

```js
import ExcelJS from "exceljs";
import { generateLeadsXlsx } from "../../services/export.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

beforeEach(async () => { await resetDb(); });

describe("generateLeadsXlsx", () => {
  test("produces a workbook with expected columns and row data", async () => {
    const { user } = await createUser();
    const campaign = await prisma.campaign.create({
      data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: {
        firstName: "Alice", lastName: "Smith", email: "a@b.com",
        title: "CTO", company: "Acme", campaignId: campaign.id, status: "CONTACTED"
      }
    });
    await prisma.reply.create({
      data: { leadId: lead.id, body: "yes!", sentiment: "INTERESTED", receivedAt: new Date() }
    });

    const buffer = await generateLeadsXlsx({});
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet("Leads");
    const headers = ws.getRow(1).values.slice(1);
    expect(headers).toEqual(["Name", "Company", "Title", "Email", "Status", "Sentiment", "Campaign", "Contacted At", "Reply Body"]);
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(2).getCell(1).value).toBe("Alice Smith");
    expect(ws.getRow(2).getCell(6).value).toBe("INTERESTED");
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/services/export.js`**

```js
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";

export async function generateLeadsXlsx(filters = {}) {
  const where = {};
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      campaign: true,
      replies: { orderBy: { receivedAt: "desc" }, take: 1 },
      emails: { where: { status: "SENT" }, orderBy: { sentAt: "desc" }, take: 1 }
    },
    orderBy: { createdAt: "desc" }
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRow(["Name", "Company", "Title", "Email", "Status", "Sentiment", "Campaign", "Contacted At", "Reply Body"]);

  for (const l of leads) {
    ws.addRow([
      `${l.firstName} ${l.lastName}`,
      l.company || "",
      l.title || "",
      l.email || "",
      l.status,
      l.replies[0]?.sentiment || "",
      l.campaign?.name || "",
      l.emails[0]?.sentAt ? new Date(l.emails[0].sentAt).toISOString() : "",
      l.replies[0]?.body || ""
    ]);
  }

  return await wb.xlsx.writeBuffer();
}
```

- [ ] **Step 4: Run — verify PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): add xlsx export service"
```

---

### Task 8.2: Export route + page

**Files:**
- Create: `backend/routes/export.js`, `backend/tests/routes/export.test.js`, `frontend/src/app/(app)/export/page.jsx`
- Modify: `backend/app.js`

- [ ] **Step 1: Write failing test**

```js
import request from "supertest";
import { createApp } from "../../app.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

const app = createApp();
beforeEach(async () => { await resetDb(); });

describe("GET /api/export/leads", () => {
  test("401 unauthenticated", async () => {
    const res = await request(app).get("/api/export/leads");
    expect(res.status).toBe(401);
  });

  test("returns xlsx buffer", async () => {
    const { token } = await createUser({ role: "VIEWER" });
    const res = await request(app).get("/api/export/leads").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheet/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Create `backend/routes/export.js`**

```js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { generateLeadsXlsx } from "../services/export.js";

const router = Router();
router.use(requireAuth);

router.get("/leads", async (req, res, next) => {
  try {
    const buffer = await generateLeadsXlsx(req.query);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Wire in `backend/app.js`**

```js
import exportRouter from "./routes/export.js";
// ...
app.use("/api/export", exportRouter);
```

- [ ] **Step 5: Run — verify PASS**

- [ ] **Step 6: Create `frontend/src/app/(app)/export/page.jsx`**

```jsx
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function ExportPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (campaignId) qs.set("campaignId", campaignId);
      const res = await fetch(`${BASE}/api/export/leads?${qs}`, {
        headers: { Authorization: `Bearer ${session.backendToken}` }
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "leads.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-xl font-bold">Export leads</h1>
      <input className="w-full border p-2 rounded" placeholder="Campaign ID (optional)" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
      <select className="w-full border p-2 rounded" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Any status</option>
        <option>NEW</option><option>CONTACTED</option><option>REPLIED</option>
        <option>INTERESTED</option><option>NOT_INTERESTED</option><option>NEUTRAL</option>
        <option>CONVERTIBLE</option><option>SKIPPED</option>
      </select>
      <button disabled={busy} onClick={onDownload} className="bg-black text-white px-4 py-2 rounded">
        {busy ? "Generating…" : "Download .xlsx"}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/ frontend/ && git commit -m "feat: add xlsx export route and download page"
```

---

## Phase 9 — Settings + Deliverability Checklist

### Task 9.1: Settings page with deliverability checklist

**Files:**
- Create: `frontend/src/app/(app)/settings/page.jsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/settings/page.jsx`**

```jsx
const DELIVERABILITY_ITEMS = [
  { id: "domain", label: "Separate sending domain configured in Instantly.ai (e.g. recruit-nst.com)" },
  { id: "spf", label: "SPF record added to sending domain DNS" },
  { id: "dkim", label: "DKIM record added to sending domain DNS" },
  { id: "dmarc", label: "DMARC policy set on sending domain DNS" },
  { id: "warmup", label: "4-week inbox warm-up completed in Instantly.ai" },
  { id: "cap", label: "Daily send volume capped at 30–50 emails/mailbox" }
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

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

- [ ] **Step 2: Manual smoke test** — visit `/settings` and verify the checklist renders.

- [ ] **Step 3: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): add settings page with deliverability checklist"
```

---

### Task 9.2: Dashboard overview

**Files:**
- Modify: `frontend/src/app/(app)/dashboard/page.jsx`

- [ ] **Step 1: Replace `frontend/src/app/(app)/dashboard/page.jsx`**

```jsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState({ campaigns: 0, leads: 0, replies: 0 });

  useEffect(() => {
    if (!session?.backendToken) return;
    Promise.all([
      apiFetch("/api/campaigns", { token: session.backendToken }),
      apiFetch("/api/leads", { token: session.backendToken }),
      apiFetch("/api/replies", { token: session.backendToken })
    ]).then(([c, l, r]) => setStats({
      campaigns: c.campaigns.length,
      leads: l.leads.length,
      replies: r.replies.length
    }));
  }, [session?.backendToken]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <Link href="/campaigns" className="border rounded p-4 hover:bg-gray-50">
          <div className="text-xs text-gray-500">Campaigns</div>
          <div className="text-3xl font-bold">{stats.campaigns}</div>
        </Link>
        <Link href="/leads" className="border rounded p-4 hover:bg-gray-50">
          <div className="text-xs text-gray-500">Leads</div>
          <div className="text-3xl font-bold">{stats.leads}</div>
        </Link>
        <Link href="/replies" className="border rounded p-4 hover:bg-gray-50">
          <div className="text-xs text-gray-500">Replies</div>
          <div className="text-3xl font-bold">{stats.replies}</div>
        </Link>
      </div>
      <Link href="/campaigns/new" className="inline-block bg-black text-white px-4 py-2 rounded">
        + New campaign
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/ && git commit -m "feat(frontend): add dashboard overview"
```

---

## Final Integration Check

### Task F.1: End-to-end manual smoke test

- [ ] **Step 1: Start backend and frontend**

```bash
# terminal 1
cd backend && npm run dev
# terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Create admin user via backend REPL or SQL**

```bash
node -e "
import('./backend/lib/auth.js').then(async ({ hashPassword }) => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  await p.user.create({ data: { email: 'admin@test.com', password: await hashPassword('admin1234'), role: 'ADMIN' } });
  console.log('created');
  await p.\$disconnect();
});
"
```

- [ ] **Step 3: Walk the golden path**

1. Sign in at `/login` with `admin@test.com` / `admin1234`.
2. Go to `/campaigns/new`, submit a goal like "Heads of Engineering at unicorn startups in India".
3. Confirm `/campaigns/[id]` shows extracted filters.
4. Click "Run campaign"; watch job progress bar transition through `created → active → completed`.
5. Visit `/leads`; confirm leads appear with email addresses.
6. Open a lead; confirm draft email was auto-generated; click Send (or wait for dispatch).
7. Simulate a webhook reply:

```bash
curl -X POST http://localhost:4000/api/webhooks/instantly \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $INSTANTLY_WEBHOOK_SECRET" \
  -d '{"event":"reply_received","lead_email":"<lead-email>","body":"Yes, I am interested","received_at":"2026-04-11T10:00:00Z"}'
```

8. Visit `/replies`; confirm reply appears with sentiment + draft follow-up.
9. Approve the follow-up; verify the Instantly service is called.
10. Visit `/export`; download a .xlsx and open it to confirm contents.

- [ ] **Step 4: Run the full test suite**

```bash
cd backend && npm test
cd frontend && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: final integration check passing" --allow-empty
```

---

## Appendix — Spec Coverage Map

| Spec section | Covered by |
|---|---|
| §2 Tech stack | Tasks 0.2, 0.4 |
| §3 Project structure | Task 0.2, 0.4 (file tree above) |
| §4 Data model | Task 0.3 |
| §5 Auth routes | Tasks 1.3 |
| §5 Users routes | Task 1.4 |
| §5 Campaigns routes | Tasks 3.3, 4.2 |
| §5 Leads routes | Task 4.3 |
| §5 Emails routes | Task 5.3 |
| §5 Replies routes | Task 7.4 |
| §5 Webhooks | Task 7.3 |
| §5 Export | Task 8.2 |
| §5 Jobs polling | Task 2.1 |
| §6 Pipeline (fetch-leads → generate-email → dispatch) | Tasks 4.2, 5.2, 6.2 |
| §6 process-reply job | Task 7.2 |
| §7 prompt.js | Task 3.2 |
| §7 lusha.js | Task 4.1 |
| §7 emailGen.js | Task 5.1 |
| §7 instantly.js | Task 6.1 |
| §7 replyHandler.js | Task 7.1 |
| §7 export.js | Task 8.1 |
| §8 RBAC matrix | Tasks 1.2 + per-route `requireRole` calls |
| §9 Error handling | Task 4.1 (429 backoff), 7.2 (idempotency), 7.3 (webhook 401), errorHandler middleware |
| §10 Deliverability checklist | Task 9.1 |
| §11 Env vars | Task 0.1 (.env.example), 0.2 (env.js) |
| §12 Out of scope | Deliberately not implemented |

## Known Deferred Items (intentional, not gaps)

- **SenderProfile table + settings UI for sender details.** Currently `DEFAULT_PROFILE` is hardcoded in `workers/generateEmail.js`. A future task would add a `SenderProfile` Prisma model and a settings form. Tracked as TODO comment in that file.
- **Runtime API key management.** Spec §8 lists "Change API keys" as admin-only. v1 uses env vars only; the settings page notes this.
- **Fine-grained pagination** on `/api/leads` and `/api/replies` (capped at 500 for now — good enough until leads > 500).
