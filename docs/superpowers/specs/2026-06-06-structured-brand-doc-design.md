# Structured Brand Doc Design

**Date:** 2026-06-06
**Branch:** feat/two-phase-lusha-enrichment

## Problem

The existing brand doc is a freeform textarea — a single `content: String` column on the `BrandDoc` singleton. There are no dedicated fields for proof points, banned words, target personas, tone, or campaign goals. There is no file upload. The AI receives an unstructured blob and has no way to enforce individual constraints (e.g. banned words, proof point injection).

## Goal

Replace the freeform textarea with structured fields and add PDF/DOCX upload with AI extraction. All fields remain org-wide (singleton), feed into every AI call automatically, and are editable by any authenticated user.

## Data Model

Replace `content: String` on `BrandDoc` with five nullable text columns. Drop `content` entirely.

```prisma
model BrandDoc {
  id              String    @id @default("singleton")
  tone            String?
  campaignGoals   String?
  targetPersonas  String?
  proofPoints     String?
  bannedWords     String?
  fileName        String?
  uploadedBy      User?     @relation(fields: [uploadedById], references: [id])
  uploadedById    String?
  uploadedAt      DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

Migration: `remove_content_add_structured_brand_fields` — drop `content`, add the five new nullable columns.

## API

All endpoints require authentication. No RBAC restriction — any authenticated role can read and write.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/brand-doc` | Return structured fields |
| `POST` | `/api/brand-doc` | Save structured fields |
| `POST` | `/api/brand-doc/extract` | Upload PDF/DOCX → AI extracts fields → return pre-populated values (does NOT save) |

### Extract endpoint detail

- `multer` handles the upload in memory (no disk writes, no file storage service)
- `pdf-parse` extracts text from PDF files
- `mammoth` extracts text from DOCX files
- Extracted text is sent to Gemini with a prompt asking it to return JSON with the 5 structured fields
- Response is returned to the frontend for admin review — nothing is persisted at this stage

### Save endpoint body

```json
{
  "tone": "Professional, concise, no jargon",
  "campaignGoals": "Book demo calls with CTOs at Series B SaaS...",
  "targetPersonas": "CTOs and VP Eng, 50–500 employees, Series A–C...",
  "proofPoints": "3x pipeline for Acme Corp in 90 days\nSaved $200K for XYZ SaaS",
  "bannedWords": "synergy, leverage, disrupt",
  "fileName": "brand-guidelines-v3.pdf"
}
```

All fields are optional. A missing field is saved as `null` (clears the value), not left unchanged. The upsert always writes all 5 fields.

## Frontend

Single scrolling form on `/settings`, replacing the current textarea.

### Upload section (top)
- File picker accepting `.pdf` and `.docx`
- On upload: shows "Extracting…" spinner
- On success: pre-fills all five fields with extracted values, highlighted in yellow with a warning "Extracted from upload — review before saving"
- Admin edits as needed, then clicks Save

### Five fields (stacked below upload)
| Field | Input type | Notes |
|-------|-----------|-------|
| Tone | Single-line text | e.g. "Professional, concise, no jargon" |
| Campaign Goals | Textarea | Free text |
| Target Personas | Textarea | Free text |
| Proof Points | Textarea (monospace) | One per line |
| Banned Words | Textarea (monospace) | Comma-separated or one per line |

### Permissions
Any authenticated user can read and edit. No read-only mode for lower roles.

### Save button
Shows last-saved timestamp. Disabled while saving. All five fields submitted together.

## AI Prompt Injection

All 4 AI call sites read the singleton and build a formatted brand guidelines block before injecting into the prompt. Empty fields are omitted.

```
BRAND GUIDELINES — follow these for every output:
- Tone: Professional, concise, no jargon
- Campaign goals: Book demo calls with CTOs at Series B SaaS
- Target personas: CTOs and VP Eng, 50–500 employees, Series A–C
- Proof points:
  • 3x pipeline for Acme Corp in 90 days
  • Saved $200K for XYZ SaaS
- Banned words (never use): synergy, leverage, disrupt
```

### Call sites updated
- `services/emailGen.js` — `generateDraft`, `generateTemplateEmail`
- `services/prompt.js` — `extractFilters`
- `services/replyHandler.js` — `draftFollowUp`

Each call site accepts the structured fields object instead of the raw `brandDoc` string. A shared `formatBrandGuidelines(fields)` helper builds the string — lives in `services/brandDoc.js`.

## New Dependencies

- `multer` — multipart file upload handling (in-memory storage)
- `pdf-parse` — PDF text extraction
- `mammoth` — DOCX text extraction

## Out of Scope

- Per-user brand docs (org-wide singleton only)
- File storage (extracted text is stored, not the raw file)
- Version history of brand doc changes
- Brand doc preview/rendering
