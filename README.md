<div align="center">

<a href="https://github.com/vedant-valid/b2b_sales">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=32&duration=2800&pause=2000&color=6366F1&center=true&vCenter=true&width=940&lines=AI-Powered+B2B+SDR+Platform;Automate+Lead+Sourcing+%E2%86%92+Outreach+%E2%86%92+Replies;Built+for+Newton+School+of+Technology" alt="Typing SVG" />
</a>

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-25-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-AI_Core-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io)

<br/>

> **Reduced 90% of manual SDR effort · Saved ₹1.25L in 3 months · Built for Newton School of Technology**

</div>

---

## The Problem

Newton School of Technology's SDR team was losing **3–5 hours every day** to tasks that should never require a human:

| Manual Task | Time Lost Daily |
|---|---|
| Searching for leads across platforms | ~1.5 hrs |
| Cleaning and deduplicating lead data | ~1 hr |
| Identifying high-potential prospects | ~1 hr |
| Writing and personalising outreach emails | ~1 hr |

Sales reps were spending more time on data entry than on actual selling — calls, demos, and closing deals.

---

## The Solution

A fully automated AI-powered SDR pipeline that handles everything from a plain-English campaign goal to personalised email dispatch and reply handling.

```
"Find CTOs at Series B SaaS startups in India"
         ↓
  Gemini extracts structured filters
         ↓
  Lusha surfaces 100s of matching leads
         ↓
  SDR reviews → selects best-fit leads
         ↓
  Lusha enriches with verified emails
         ↓
  Gemini writes personalised emails
         ↓
  SDR approves → Instantly dispatches
         ↓
  Inbound replies auto-classified + follow-ups drafted
```

---

## Results

<div align="center">

| Metric | Before | After |
|---|---|---|
| Daily manual SDR hours | 3–5 hrs | ~20 min |
| Lead sourcing time | 90 min | Automated |
| Email writing time | 60 min | Automated |
| Operational cost (3 months) | Baseline | **₹1.25L saved** |
| SDR focus | Data work | Calls & closing |

</div>

---

## System Architecture

```mermaid
flowchart TD
    A([🧑 SDR: Campaign Goal in Plain English]) --> B

    subgraph AI["🤖 AI Layer — Gemini 2.5 Flash"]
        B[Filter Extraction\nNatural language → Lusha JSON filters]
        G[Email Generation\nPersonalised subject + body per lead]
        K[Sentiment Analysis\nPositive / Negative / Neutral / Meeting]
        L[Follow-up Drafting\nContext-aware reply suggestions]
    end

    subgraph ENRICHMENT["📋 Lead Pipeline — Lusha API"]
        C[Phase 1 · Search\nFetch preview pool of matching leads]
        D[Lead Selection UI\nSDR reviews fit score + picks leads]
        F[Phase 2 · Enrich\nUnlock verified emails for selected leads]
    end

    subgraph OUTREACH["📨 Outreach — Instantly.ai"]
        H[Approval Gate\nSDR reviews all email drafts]
        I[Campaign Dispatch\nInstantly sends at optimal times]
        J[Inbound Webhook\nReply received from prospect]
    end

    subgraph DB["🗄️ Data Layer — PostgreSQL + Prisma"]
        P[(Campaign\nLead · Email\nReply)]
    end

    subgraph QUEUE["⚙️ Job Queue — pg-boss"]
        Q1[fetch-leads worker]
        Q2[generate-email worker]
        Q3[dispatch-to-instantly worker]
        Q4[process-reply worker]
    end

    B --> Q1 --> C --> D --> F --> Q2
    Q2 --> G --> H --> Q3 --> I --> J --> Q4
    Q4 --> K --> L
    Q1 & Q2 & Q3 & Q4 <--> P

    style AI fill:#EEF2FF,stroke:#6366F1,color:#1e1b4b
    style ENRICHMENT fill:#F0FDF4,stroke:#22C55E,color:#14532d
    style OUTREACH fill:#FFF7ED,stroke:#F97316,color:#431407
    style DB fill:#F8FAFC,stroke:#94A3B8,color:#0f172a
    style QUEUE fill:#FDF4FF,stroke:#A855F7,color:#2e1065
```

---

## AI & Technology Stack

### AI / Intelligence
| Layer | Technology | Role |
|---|---|---|
| LLM Core | **Gemini 2.5 Flash** | Filter extraction, email generation, sentiment classification, follow-up drafting |
| Lead Intelligence | **Lusha API** | Two-phase: preview search → verified email enrichment |
| Email Automation | **Instantly.ai** | Deliverability-optimised dispatch + reply webhooks |

### Backend
| Technology | Version | Role |
|---|---|---|
| Node.js | v25 | Runtime |
| Express | 5 | REST API |
| Prisma | 6 | ORM + schema migrations |
| PostgreSQL | 16 | Primary database |
| pg-boss | 10 | Persistent job queue for async pipeline |
| Zod | 3 | Runtime schema validation |

### Frontend
| Technology | Version | Role |
|---|---|---|
| Next.js | 15 | React framework with App Router |
| React | 19 | UI library |
| Tailwind CSS | 4 | Styling |
| NextAuth.js | — | Session auth with JWT |

---

## Pipeline Deep Dive

### Two-Phase Lead Enrichment
Lusha charges per enrichment. The platform uses a **preview → select → enrich** flow so the SDR only unlocks emails for leads they've actually chosen — cutting Lusha credit waste.

### Approval Gates
Two human-in-the-loop checkpoints:
1. **Lead Selection** — SDR picks from the preview pool before any credits are spent
2. **Email Approval** — SDR reviews every draft before anything is sent

### Background Job Orchestration
All heavy work runs in `pg-boss` queues so the API stays non-blocking. Each worker picks up exactly where the last left off, with retries on failure:

```
fetch-leads → generate-email (×N leads) → dispatch-to-instantly → process-reply
```

### RBAC
Three roles — `ADMIN`, `MANAGER`, `VIEWER` — enforced at the route level via `requireRole()` middleware.

---

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (copy and fill in keys)
cp backend/.env.example backend/.env

# 3. Run migrations and seed
cd backend && npm run prisma:migrate && node prisma/seed.js

# 4. Start both servers
npm run dev:backend   # :4000
npm run dev:frontend  # :3000
```

**Required env vars:** `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `LUSHA_API_KEY`, `INSTANTLY_API_KEY`

---

<div align="center">

Built by [Vedant Madne](https://github.com/vedant-valid) for Newton School of Technology's SDR team.

</div>
