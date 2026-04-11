# AI-Powered Outbound Automation Platform — Design Spec

**Date:** 2026-04-11  
**Status:** Approved  
**Stack:** Next.js 15 + Node.js/Express + PostgreSQL + Prisma + pg-boss  

---

## 1. Overview

An autonomous AI-driven outbound automation platform that converts a single natural language goal into a fully executed email campaign — fetching leads, generating personalized emails, dispatching via Instantly.ai, classifying replies, and drafting follow-ups for human review.

**Primary use cases:** Hiring outreach, B2B sales, partnerships.

**Example input:**  
> "Approach Heads of Engineering at unicorn startups in India to hire NST students"

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Job Queue | pg-boss (Postgres-backed, no Redis) |
| Auth | NextAuth.js + JWT + RBAC |
| LLM | Gemini API (intent extraction, email gen, sentiment, follow-up drafting) |
| Lead Data | Lusha Prospecting + Signals APIs |
| Email Sending | Instantly.ai API V2 |
| Export | exceljs (.xlsx on-demand download) |

---

## 3. Project Structure

```
/outreach-app
├── /frontend                         → Next.js 15 (App Router + Tailwind)
│   └── /src
│       ├── /app
│       │   ├── (auth)/login          → Login page
│       │   └── (app)/                → Protected layout
│       │       ├── dashboard/
│       │       ├── campaigns/
│       │       │   ├── page.jsx      → Campaign list
│       │       │   ├── new/page.jsx  → Campaign wizard
│       │       │   └── [id]/page.jsx → Campaign detail + job progress
│       │       ├── leads/
│       │       │   ├── page.jsx      → All leads
│       │       │   └── [id]/page.jsx → Lead detail + emails + replies
│       │       ├── replies/page.jsx  → All replies + follow-up approval
│       │       ├── export/page.jsx   → .xlsx export
│       │       └── settings/
│       │           ├── page.jsx      → API keys + sender profile
│       │           └── users/page.jsx → User management (admin only)
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
│           ├── api.js                → Fetch wrapper
│           └── auth.js               → NextAuth config + role helpers
│
├── /backend
│   ├── server.js                     → Express app entry point + pg-boss init
│   ├── /routes
│   │   ├── auth.js
│   │   ├── campaigns.js
│   │   ├── leads.js
│   │   ├── emails.js
│   │   ├── replies.js
│   │   ├── webhooks.js
│   │   ├── export.js
│   │   ├── jobs.js
│   │   └── users.js
│   ├── /services
│   │   ├── prompt.js                 → NL → Lusha filters (Gemini)
│   │   ├── lusha.js                  → Lead search + enrichment
│   │   ├── emailGen.js               → Email drafting (Gemini)
│   │   ├── instantly.js              → Campaign + lead push to Instantly.ai
│   │   ├── replyHandler.js           → Sentiment classification + follow-up draft (Gemini)
│   │   └── export.js                 → .xlsx generation (exceljs)
│   ├── /workers
│   │   ├── fetchLeads.js
│   │   ├── generateEmail.js
│   │   ├── dispatchCampaign.js
│   │   └── processReply.js
│   ├── /middleware
│   │   ├── auth.js                   → JWT verification
│   │   ├── rbac.js                   → Role-based access control
│   │   └── errorHandler.js
│   └── /prisma
│       ├── schema.prisma
│       └── /migrations
│
└── /shared
    └── types.js                      → Shared enums/constants
```

---

## 4. Data Model (Prisma Schema)

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

---

## 5. API Routes

### Auth
```
POST   /api/auth/login              → Issue JWT
POST   /api/auth/logout
```

### Users (admin only)
```
GET    /api/users                   → List users
POST   /api/users                   → Create user
PATCH  /api/users/:id/role          → Change role
```

### Campaigns
```
POST   /api/campaigns               → Create campaign + run Gemini filter extraction
GET    /api/campaigns               → List (scoped by role)
GET    /api/campaigns/:id           → Detail + job status
POST   /api/campaigns/:id/run       → Enqueue full pipeline
PATCH  /api/campaigns/:id/pause     → Pause running campaign
```

### Leads
```
GET    /api/leads                   → List (filter: campaign, status, sentiment)
GET    /api/leads/:id               → Detail + emails + replies
PATCH  /api/leads/:id               → Update status / notes
```

### Emails
```
GET    /api/leads/:id/emails        → Email history (all versions)
POST   /api/leads/:id/emails        → Generate new draft (enqueues generate-email job)
POST   /api/emails/:id/send         → Approve + send via Instantly.ai
POST   /api/emails/:id/regenerate   → Bump version, re-generate draft
```

### Replies
```
GET    /api/replies                 → All replies (filter: sentiment, campaign)
GET    /api/replies/:id             → Reply detail + draft follow-up
POST   /api/replies/:id/approve     → Send follow-up via Instantly.ai subsequence
```

### Webhooks
```
POST   /api/webhooks/instantly      → reply_received events (verified by shared secret)
```

### Export
```
GET    /api/export/leads            → Download .xlsx (filter: campaign, status, date range)
```

### Jobs
```
GET    /api/jobs/:id                → Poll job status for UI progress bar
```

---

## 6. Job Queue Pipeline (pg-boss)

### Job Types

| Job | Worker | Retries | Notes |
|---|---|---|---|
| `fetch-leads` | `workers/fetchLeads.js` | 3 | Lusha: 25 req/sec, exponential backoff on 429 |
| `generate-email` | `workers/generateEmail.js` | 2 | Concurrency: 5 parallel |
| `dispatch-to-instantly` | `workers/dispatchCampaign.js` | 3 | Runs after all generate-email jobs complete |
| `process-reply` | `workers/processReply.js` | 2 | Triggered by webhook |

### Pipeline Flow

```
POST /api/campaigns/:id/run
        ↓
[fetch-leads] job
    Lusha Prospecting API → N Lead rows stored
        ↓ (on complete)
[generate-email] × N jobs  (concurrency: 5)
    Gemini API → N Email draft rows stored
        ↓ (when all N complete)
[dispatch-to-instantly] job
    Instantly.ai POST /api/v2/campaigns → create campaign
    Instantly.ai POST /api/v2/leads (bulk) → inject leads with custom vars
    Campaign.instantlyCampaignId stored
        ↓ (async, via webhook)
POST /api/webhooks/instantly (reply_received)
        ↓
[process-reply] job
    Gemini → sentiment classification
    Gemini → draft follow-up
    Reply row stored (sentiment + draftFollowUp)
    Lead.status updated
```

---

## 7. Service Contracts

### `prompt.js`
```
extractFilters(rawGoal: string) → { filters: LushaParams, confidence: number }
```
Calls Gemini with cached Lusha filter options as context. Returns structured Lusha-compatible params. If confidence < 0.7, returns a clarification prompt instead.

### `lusha.js`
```
searchLeads(filters: LushaParams) → Lead[]
enrichContact(lushaPersonId: string) → { email, phone }
```
Handles pagination, rate limiting (25 req/sec), and 429 exponential backoff internally.

### `emailGen.js`
```
generateDraft(lead: Lead, userProfile: UserProfile) → { subject, body }
```
Calls Gemini with lead data + sender profile. Includes hook (company news), bridge (NST value), proof (achievements), CTA.

### `instantly.js`
```
createCampaign(name: string) → { instantlyCampaignId }
pushLeads(campaignId: string, leads: LeadWithEmail[]) → { accepted, rejected }
sendSubsequence(leadEmail: string, body: string) → void
```

### `replyHandler.js`
```
classifySentiment(replyBody: string) → Sentiment
draftFollowUp(replyBody: string, lead: Lead) → string
```
Two sequential Gemini calls: first classify, then draft. Sentiment feeds into the follow-up prompt as context.

### `export.js`
```
generateLeadsXlsx(filters: ExportFilters) → Buffer
```
Queries Postgres via Prisma, generates .xlsx with columns: Name, Company, Title, Email, Status, Sentiment, Campaign, Contacted At, Reply Body.

---

## 8. RBAC Matrix

| Action | Admin | Manager | Viewer |
|---|---|---|---|
| Create / launch campaign | ✓ | ✓ | ✗ |
| View all campaigns | ✓ | ✓ | ✓ |
| Pause campaign | ✓ | ✓ | ✗ |
| View leads | ✓ | ✓ | ✓ |
| Update lead status | ✓ | ✓ | ✗ |
| Generate / regenerate email | ✓ | ✓ | ✗ |
| Approve + send email | ✓ | ✓ | ✗ |
| View replies | ✓ | ✓ | ✓ |
| Approve follow-up | ✓ | ✓ | ✗ |
| Export .xlsx | ✓ | ✓ | ✓ |
| Manage users | ✓ | ✗ | ✗ |
| Change API keys | ✓ | ✗ | ✗ |

---

## 9. Error Handling

| Failure | Strategy |
|---|---|
| Lusha 429 | Exponential backoff in worker; job retries up to 3x |
| Lusha returns 0 leads | Campaign → COMPLETED; UI shows "0 leads found" + filter edit prompt |
| Gemini timeout | Job retries 2x with 5s delay; error stored on Email/Reply row |
| Instantly.ai webhook duplicate | Idempotency: skip if Reply with same `[leadId, receivedAt]` exists |
| Webhook secret mismatch | 401 immediately; logged for admin |
| Job exhausts all retries | pg-boss marks job `failed`; Campaign → PAUSED; UI shows retry button |
| Prisma constraint violation | 400 returned with field-level error message |

---

## 10. Deliverability Requirements (Prerequisites)

Per the PDF spec — must be completed before first campaign launch:

- [ ] Separate sending domain configured in Instantly.ai (e.g., `recruit-nst.com`)
- [ ] SPF record added to sending domain DNS
- [ ] DKIM record added to sending domain DNS
- [ ] DMARC policy set on sending domain DNS
- [ ] 4-week inbox warm-up completed in Instantly.ai
- [ ] Daily send volume capped at 30–50 emails/mailbox (enforced in Instantly.ai settings)

The Settings page in the app shows this checklist with documentation links.

---

## 11. Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/outreach

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# LLM
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Lusha
LUSHA_API_KEY=

# Instantly.ai
INSTANTLY_API_KEY=
INSTANTLY_WEBHOOK_SECRET=

# App
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:4000
```

---

## 12. Out of Scope (this version)

- Google Sheets sync (can be added as a one-way push later)
- OAuth login (email + password only for now)
- Multi-tenant SaaS billing
- LinkedIn outreach (email only)
- Automatic follow-up sending without human approval
