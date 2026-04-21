# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered B2B outreach platform. Users define campaigns in plain English; the system uses Gemini to extract structured lead filters, Lusha to fetch and enrich leads, generates personalised emails via Gemini, dispatches them through Instantly.ai, and classifies inbound replies with sentiment analysis.

## Repository Layout

```
/                   npm workspaces root
├── backend/        Express API + pg-boss workers (ESM, Node)
├── frontend/       Next.js 15 app (React 19, Tailwind 4)
└── docs/           Design docs and plans
```

## Commands

### Root (run from repo root)
```bash
npm run dev:backend      # Start backend with --watch
npm run dev:frontend     # Start Next.js on :3000
npm run test:backend     # Run Jest tests for backend
npm run test:frontend    # Run Vitest tests for frontend
```

### Backend (run from `backend/`)
```bash
npm run dev              # node --watch server.js  (port 4000)
npm test                 # Jest with NODE_OPTIONS=--experimental-vm-modules
npx jest tests/routes/campaigns.test.js  # Run a single test file
npm run prisma:migrate   # prisma migrate dev
npm run prisma:generate  # prisma generate
```

### Frontend (run from `frontend/`)
```bash
npm run dev              # next dev -p 3000
npm test                 # vitest run (single pass)
npm run test:watch       # vitest (watch mode)
```

## Backend Architecture

### Entry points
- `server.js` — starts Express and calls `registerWorkers()`
- `app.js` — `createApp()` wires all routers and global middleware

### Request pipeline
`requireAuth` (JWT Bearer) → `requireRole(...)` (RBAC: ADMIN / MANAGER / VIEWER) → route handler → Zod validation → Prisma → response

### Background jobs (pg-boss queues)
Four workers registered on startup in `workers/index.js`:

| Queue | File | Triggered by |
|-------|------|--------------|
| `fetch-leads` | `workers/fetchLeads.js` | `POST /api/campaigns/:id/run` |
| `generate-email` | `workers/generateEmail.js` | fetchLeads after upserting leads |
| `dispatch-to-instantly` | `workers/dispatchCampaign.js` | generateEmail after all drafts ready |
| `process-reply` | `workers/processReply.js` | Instantly.ai webhook |

**Pipeline chain**: `fetch-leads` → `generate-email` (one per lead) → `dispatch-to-instantly` → Instantly sends emails → webhook → `process-reply`.

### Services
- `services/prompt.js` — `extractFilters(rawGoal)`: calls Gemini to convert natural-language campaign goals into Lusha filter JSON
- `services/lusha.js` — `searchLeads(filters)`: fetches + enriches leads (returns email included)
- `services/gemini.js` — thin wrapper around `@google/generative-ai`
- `services/instantly.js` — `createCampaign`, `pushLeads`, `activateCampaign`
- `services/replyHandler.js` — `classifySentiment`, `draftFollowUp`
- `services/emailGen.js` — generates personalised email subject/body per lead
- `services/export.js` — exports leads to Excel via ExcelJS

### Dependency injection pattern for tests
External service calls are injectable. Each worker/route exports a `__set*Impl` function (e.g. `__setLushaImpl`, `__setInstantlyImpl`) that replaces the live implementation in tests. This avoids mocks at the module level.

### Database (Prisma + PostgreSQL)
Models: `User` → `Campaign` → `Lead` → `Email`, `Reply`

Key enums: `Role` (ADMIN/MANAGER/VIEWER), `CampaignStatus`, `LeadStatus`, `EmailStatus`, `Sentiment`.

`Reply` has a composite unique index on `(leadId, receivedAt)` for webhook idempotency.

### Environment variables (`backend/config/env.js`)
Validated with Zod at startup. Required: `DATABASE_URL`, `JWT_SECRET`. Optional: `GEMINI_API_KEY`, `LUSHA_API_KEY`, `INSTANTLY_API_KEY`, `INSTANTLY_WEBHOOK_SECRET`. Defaults: `PORT=4000`, `FRONTEND_URL=http://localhost:3000`.

## Frontend Architecture

### Auth
NextAuth.js (credentials provider) issues a session containing the user's JWT token and role. The token is passed as `Authorization: Bearer …` on all `apiFetch` calls in `src/lib/api.js`.

### Route groups
- `(auth)/login` — public login page
- `(app)/` — protected routes; `layout.jsx` redirects unauthenticated users and renders the sidebar nav

### Key pages
- `/campaigns` — list; `/campaigns/new` — CampaignWizard (multi-step: goal → filter preview → confirm); `/campaigns/[id]` — detail with lead table and email drafts
- `/leads/[id]` — lead detail with EmailDraftPanel
- `/replies` — inbound reply cards with sentiment badges
- `/export` — ExportModal for downloading lead data
- `/settings/users` — user management (ADMIN only)

### API calls
All backend requests go through `src/lib/api.js:apiFetch`. Base URL is `NEXT_PUBLIC_BACKEND_URL` (defaults to `http://localhost:4000`).

## Testing

### Backend (Jest)
- Config: `backend/jest.config.js` — `testEnvironment: node`, `maxWorkers: 1` (sequential to avoid DB conflicts)
- Setup: `backend/tests/setup.js` — exports `resetDb()` helper; calls `prisma.$disconnect()` in `afterAll`
- Factory: `backend/tests/helpers/factory.js` — `createUser({ email, role, password })` returns `{ user, token }`; `authHeader(token)` returns the header object
- Tests hit a real database (no DB mocking)

### Frontend (Vitest)
- Config comes from `frontend/package.json`; uses jsdom environment and `@testing-library/react`
