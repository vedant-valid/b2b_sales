# Multi-Sender Campaign Support

**Date:** 2026-06-01  
**Status:** Approved

## Problem

The app currently supports only one sending email (`nst.b2b.marketing@gmail.com` hardcoded via `INSTANTLY_SENDING_ACCOUNTS` env var). With 10–15 team members each needing to run their own campaigns from their own email, this is a blocker for scaling outreach.

## Goal

Allow multiple team members to each have one or more sending email accounts assigned to them. Each person picks their sender when creating a campaign; dispatches go out from that specific email via Instantly.

## Flow

1. Admin connects email accounts to Instantly workspace (done in Instantly UI — already complete, 7+ accounts exist)
2. Admin opens `/settings/senders` in our app → clicks **Sync from Instantly** → app pulls all accounts from Instantly API and stores them locally
3. Admin assigns senders to users (e.g. `akshay.singh@nstx.co.in` → Akshay's user account)
4. Akshay creates a campaign → picks which of his assigned emails to send from
5. Campaign dispatches via Instantly using that specific sending email

## Data Model

### New: `SenderAccount`

```prisma
model SenderAccount {
  email         String               @id
  status        String?
  healthScore   Float?
  emailsSent    Int                  @default(0)
  warmupEmails  Int                  @default(0)
  syncedAt      DateTime             @default(now())
  assignments   UserSenderAccount[]
}
```

### New: `UserSenderAccount` (join table)

```prisma
model UserSenderAccount {
  userId        String
  senderEmail   String
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  sender        SenderAccount @relation(fields: [senderEmail], references: [email], onDelete: Cascade)
  assignedAt    DateTime      @default(now())

  @@id([userId, senderEmail])
}
```

### Updated: `Campaign`

Add `senderEmail String?` — stores which sending account was chosen at campaign creation. Nullable for backwards compatibility with old campaigns.

### Updated: `User`

Add `senderAccounts UserSenderAccount[]` relation.

## Backend

### New endpoints (all behind `requireAuth`)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `POST` | `/api/sender-accounts/sync` | ADMIN | Calls Instantly `GET /api/v2/accounts`, upserts all accounts into `SenderAccount` table |
| `GET` | `/api/sender-accounts` | ADMIN | Returns all synced accounts with their assigned users |
| `POST` | `/api/sender-accounts/:email/assign` | ADMIN | Body: `{ userId }` — creates `UserSenderAccount` row |
| `DELETE` | `/api/sender-accounts/:email/assign/:userId` | ADMIN | Removes assignment |
| `GET` | `/api/sender-accounts/mine` | Any | Returns sender accounts assigned to the current user |

### Updated: Campaign creation (`POST /api/campaigns`)

- Accepts optional `senderEmail` in request body
- Validates that `senderEmail` is assigned to the requesting user (if provided)
- Stores on the `Campaign` record

### Updated: Dispatch worker (`workers/dispatchCampaign.js`)

- Reads `campaign.senderEmail` first
- Falls back to `env.INSTANTLY_SENDING_ACCOUNTS` if `senderEmail` is null (backwards compatibility for old campaigns)
- Passes `email_list: [senderEmail]` to `createCampaign` in Instantly

### Instantly sync logic (`services/instantly.js`)

Add `listSendingAccounts()` — calls `GET /api/v2/accounts` and returns `{ email, status, healthScore, emailsSent, warmupEmails }` per account.

## Frontend

### New page: `/settings/senders` (admin only)

- Sidebar link under Settings (admin only, same as `/settings/users`)
- **Sync button** at top right — calls `POST /api/sender-accounts/sync`, shows loading state, refreshes list on success
- **Table columns:** Email | Health Score | Emails Sent | Assigned To | Actions
- **Assign control:** Each row has a dropdown/popover to pick a user — calls assign/unassign endpoints
- **Empty state:** "No sender accounts synced yet. Click Sync to pull from Instantly."

### Updated: Campaign wizard

- Add a **"Choose Sender"** step after the goal step (or as part of the confirm step)
- Shows dropdown of `GET /api/sender-accounts/mine` results
- If list is empty: warning banner — "No sending accounts assigned to you. Ask your admin."
- Selected email stored as `senderEmail` in campaign creation payload

### Sidebar nav

Add "Senders" link to Settings section, visible to ADMIN role only.

## Error Handling

- Sync fails (Instantly API down): return 502 with `instantly_error`, surface toast on frontend
- User creates campaign with no sender accounts assigned: 400 `no_sender_assigned` error, frontend shows inline warning in wizard
- Assign endpoint called with non-existent userId or email: 404

## Backwards Compatibility

- Old campaigns with `senderEmail: null` still dispatch using `INSTANTLY_SENDING_ACCOUNTS` env var — no breakage
- `INSTANTLY_SENDING_ACCOUNTS` env var is kept as a fallback; not removed

## Out of Scope

- Automatically syncing on a schedule (manual sync only)
- Per-sender sending limits or rate controls
- Users adding their own email accounts (admin-only)
- Deleting sender accounts from within the app (manage in Instantly)
