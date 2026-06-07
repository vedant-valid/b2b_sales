import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { extractFilters as realExtractFilters } from "../services/prompt.js";
import { enrichLeads as realEnrichLeads } from "../services/lusha.js";
import { generateTemplateEmail as realGenerateTemplateEmail } from "../services/emailGen.js";
import { generateText } from "../services/gemini.js";
import { getCampaignAnalytics } from "../services/instantly.js";
import { getBoss } from "../lib/pgboss.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

async function generateLeadSummary(lead, rawGoal) {
  const prompt = `Write a 2-3 sentence professional summary of this sales lead for a B2B outreach rep. Be concise and factual — no filler phrases.

Name: ${lead.firstName} ${lead.lastName}
Title: ${lead.title ?? "Unknown"}
Company: ${lead.company ?? "Unknown"}
Location: ${lead.location ?? "Unknown"}
Campaign goal: ${rawGoal}`;
  return generateText(prompt);
}

let extract = realExtractFilters;
export function __setExtractFilters(fn) { extract = fn; }

let enrich = realEnrichLeads;
export function __setEnrichLeadsImpl(fn) { enrich = fn; }

let generateTemplateEmailImpl = realGenerateTemplateEmail;
export function __setGenerateTemplateEmailImpl(fn) { generateTemplateEmailImpl = fn; }

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  rawGoal: z.string().min(5),
  mode: z.enum(["OUTREACH", "TEST"]).default("OUTREACH"),
  testEmails: z.array(z.string().email()).optional(),
  senderEmail: z.string().email().optional(),
});

function parseNameFromEmail(email) {
  const prefix = email.split("@")[0];
  const parts = prefix.split(/[._-]/);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return parts.length >= 2
    ? { firstName: cap(parts[0]), lastName: cap(parts[1]) }
    : { firstName: cap(parts[0]), lastName: "Demo" };
}

function extractTitleFromGoal(rawGoal) {
  if (!rawGoal) return null;
  const patterns = [
    /\b(head of [\w\s]{2,30})/i,
    /\b(director of [\w\s]{2,30})/i,
    /\b(vp of [\w\s]{2,30})/i,
    /\b(vice president of [\w\s]{2,30})/i,
    /\b(manager of [\w\s]{2,30})/i,
    /\b([\w]+\s+manager)\b/i,
    /\b([\w]+\s+director)\b/i,
    /\b(cto|ceo|cfo|coo|cmo|cpo)\b/i,
    /\b(co-?founder|founder)\b/i,
  ];
  for (const pattern of patterns) {
    const match = rawGoal.match(pattern);
    if (match) {
      return match[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { name, rawGoal, mode, testEmails, senderEmail } = parsed.data;

    if (senderEmail) {
      const assignment = await prisma.userSenderAccount.findUnique({
        where: { userId_senderEmail: { userId: req.user.sub, senderEmail } }
      });
      if (!assignment) return res.status(403).json({ error: "sender_not_assigned" });
    }

    // TEST campaigns skip Gemini entirely — no Lusha filters needed
    if (mode === "TEST") {
      const campaign = await prisma.campaign.create({
        data: { name, rawGoal, extractedFilters: null, mode, senderEmail, createdById: req.user.sub }
      });
      if (testEmails?.length) {
        const title = extractTitleFromGoal(rawGoal) || "Staff";
        for (const email of testEmails) {
          const { firstName, lastName } = parseNameFromEmail(email);
          await prisma.lead.create({
            data: {
              lushaPersonId: `test-${campaign.id}-${email}`,
              firstName,
              lastName,
              email,
              title,
              company: "Newton School",
              campaignId: campaign.id
            }
          });
        }
      }
      return res.status(201).json({ campaign });
    }

    // OUTREACH — unchanged
    const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const extraction = await extract(rawGoal, { brandFields });
    if (extraction.needsClarification) {
      return res.status(422).json({ error: "needs_clarification", clarification: extraction.clarification });
    }
    const campaign = await prisma.campaign.create({
      data: { name, rawGoal, extractedFilters: extraction.filters, mode, senderEmail, createdById: req.user.sub }
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

router.post("/:id/run", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status === "RUNNING") return res.status(409).json({ error: "already_running" });
    const boss = await getBoss();

    // TEST campaigns with pre-seeded leads skip Lusha and go straight to email generation
    if (campaign.mode === "TEST") {
      const leads = await prisma.lead.findMany({
        where: { campaignId: campaign.id, email: { not: null } }
      });
      if (leads.length > 0) {
        // Atomic check-and-set: only one concurrent request can flip a non-RUNNING campaign to RUNNING
        const { count } = await prisma.campaign.updateMany({
          where: { id: campaign.id, status: { not: "RUNNING" } },
          data: { status: "RUNNING" }
        });
        if (count === 0) return res.status(409).json({ error: "already_running" });
        for (const lead of leads) {
          await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
        }
        return res.json({ jobId: null });
      }
    }

    // OUTREACH (or TEST with no pre-seeded leads) — unchanged
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

const approveLeadsSchema = z.object({
  approvedIds: z.array(z.string()).optional()
});

router.post("/:id/approve-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_APPROVAL") return res.status(409).json({ error: "invalid_status" });

    const parsed = approveLeadsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { approvedIds } = parsed.data;

    const allLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id, isEnriched: true, email: { not: null } }
    });

    let leadsToProcess;
    if (approvedIds !== undefined) {
      const toSkip = allLeads.filter(l => !approvedIds.includes(l.id)).map(l => l.id);
      if (toSkip.length > 0) {
        await prisma.lead.updateMany({ where: { id: { in: toSkip } }, data: { status: "SKIPPED" } });
      }
      leadsToProcess = allLeads.filter(l => approvedIds.includes(l.id) && l.status !== "SKIPPED");
    } else {
      leadsToProcess = allLeads.filter(l => l.status !== "SKIPPED");
    }

    if (leadsToProcess.length === 0) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
      return res.status(409).json({ error: "no_leads_with_email" });
    }

    const boss = await getBoss();
    for (const lead of leadsToProcess) {
      await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
    }
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete("/:id", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
    const leadIds = leads.map(l => l.id);
    await prisma.leadSelection.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.reply.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.email.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/reject-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (!["AWAITING_LEAD_APPROVAL", "AWAITING_LEAD_SELECTION"].includes(campaign.status)) {
      return res.status(409).json({ error: "invalid_status" });
    }
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
    const leadIds = leads.map(l => l.id);
    await prisma.leadSelection.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.reply.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.email.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/approve-emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_EMAIL_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    if (campaign.instantlyCampaignId) return res.status(409).json({ error: "already_dispatched" });
    const boss = await getBoss();
    await boss.send("dispatch-to-instantly", { campaignId: campaign.id });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Re-queue email generation for leads that have an email address but no draft yet.
// Safe to call on a RUNNING campaign — dispatch-to-instantly will re-run automatically
// once all missing drafts are generated, pushing the new leads to the existing Instantly campaign.
router.post("/:id/retry-emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (!campaign.instantlyCampaignId) return res.status(409).json({ error: "not_dispatched_yet" });

    const leads = await prisma.lead.findMany({
      where: { campaignId: campaign.id, isEnriched: true, email: { not: null }, emails: { none: {} } }
    });
    if (leads.length === 0) return res.json({ queued: 0 });

    const boss = await getBoss();
    for (const lead of leads) {
      await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
    }
    res.json({ queued: leads.length });
  } catch (e) { next(e); }
});

router.post("/:id/reject-emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_EMAIL_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
    const leadIds = leads.map(l => l.id);
    await prisma.reply.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.email.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get("/:id/analytics", requireRole("ADMIN", "MANAGER", "VIEWER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (!campaign.instantlyCampaignId) return res.json({ analytics: null });
    const analytics = await getCampaignAnalytics(campaign.instantlyCampaignId);
    res.json({ analytics });
  } catch (e) { next(e); }
});

// Sync lead statuses: marks NEW leads as CONTACTED if their email was already sent (webhook missed)
router.post("/:id/sync-lead-status", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });

    // Find leads that are still NEW but have a SENT email
    const staleLeads = await prisma.lead.findMany({
      where: {
        campaignId: campaign.id,
        status: "NEW",
        emails: { some: { status: "SENT" } }
      },
      select: { id: true }
    });

    if (staleLeads.length === 0) return res.json({ updated: 0 });

    const ids = staleLeads.map(l => l.id);
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { status: "CONTACTED" }
    });

    res.json({ updated: ids.length });
  } catch (e) { next(e); }
});

// Dev-only: seed a test lead so you can verify the full email pipeline locally
router.post("/:id/dev-seed-lead", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  if (env.DEV_MODE !== "true") return res.status(403).json({ error: "only_available_in_dev_mode" });
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    const devEmail = env.DEV_EMAIL || "madnevedant15@gmail.com";
    const existing = await prisma.lead.findFirst({ where: { campaignId: campaign.id, email: devEmail } });
    if (existing) return res.json({ lead: existing });
    const lead = await prisma.lead.create({
      data: {
        firstName: "Dev",
        lastName: "Test",
        email: devEmail,
        title: "Test Lead",
        company: "Dev Sandbox",
        campaignId: campaign.id
      }
    });
    res.status(201).json({ lead });
  } catch (e) { next(e); }
});

const addTestLeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional().default("Test"),
  lastName:  z.string().optional().default("Recipient"),
});

router.post("/:id/add-test-lead", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.mode !== "TEST") return res.status(409).json({ error: "only_for_test_campaigns" });

    const parsed = addTestLeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input", detail: parsed.error.flatten() });
    const { email, firstName, lastName } = parsed.data;

    const existing = await prisma.lead.findFirst({ where: { campaignId: campaign.id, email } });
    if (existing) return res.status(409).json({ error: "email_already_in_campaign" });

    const lead = await prisma.lead.create({
      data: { firstName, lastName, email, title: "Test Recipient", company: "—", campaignId: campaign.id }
    });

    const boss = await getBoss();
    await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });

    res.status(201).json({ lead });
  } catch (e) { next(e); }
});

// ─── Re-run with edited filters (from AWAITING_LEAD_SELECTION) ───────────────

const rerunFiltersSchema = z.object({
  filters: z.record(z.unknown())
});

router.post("/:id/rerun-with-filters", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_SELECTION") return res.status(409).json({ error: "invalid_status" });

    const parsed = rerunFiltersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { filters } = parsed.data;

    // Delete existing PREVIEW leads and their selections
    const existingLeads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
    const leadIds = existingLeads.map(l => l.id);
    if (leadIds.length > 0) {
      await prisma.leadSelection.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    }

    // Update filters and reset status so fetch-leads can re-run
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { extractedFilters: filters, status: "DRAFT" }
    });

    const boss = await getBoss();
    const jobId = await boss.send("fetch-leads", { campaignId: campaign.id });
    res.json({ jobId });
  } catch (e) { next(e); }
});

// ─── Phase 2: Lead Selection ──────────────────────────────────────────────────

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

    // Verify submitted IDs actually belong to this campaign
    const campaignLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id },
      select: { id: true }
    });
    const campaignLeadIdSet = new Set(campaignLeads.map(l => l.id));
    const validIds = leadIds.filter(id => campaignLeadIdSet.has(id));

    // Replace this user's entire selection for this campaign atomically
    await prisma.$transaction([
      prisma.leadSelection.deleteMany({
        where: { userId: req.user.sub, campaignId: campaign.id }
      }),
      prisma.leadSelection.createMany({
        data: validIds.map(leadId => ({
          userId: req.user.sub,
          campaignId: campaign.id,
          leadId
        }))
      })
    ]);

    res.json({ selected: validIds.length });
  } catch (e) { next(e); }
});

// ─── Phase 2: Lead Unlock (Credit-Consuming Enrichment) ──────────────────────

router.post("/:id/unlock-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_SELECTION") return res.status(409).json({ error: "invalid_status" });

    // Get this user's selections for the campaign
    const selections = await prisma.leadSelection.findMany({
      where: { userId: req.user.sub, campaignId: campaign.id },
      include: { lead: true }
    });

    if (selections.length === 0) {
      return res.status(400).json({ error: "no_leads_selected" });
    }

    const allSelected = selections.map(s => s.lead);
    const alreadyEnriched = allSelected.filter(l => l.isEnriched);
    const toEnrich = allSelected.filter(l => !l.isEnriched && l.lushaPersonId && l.lushaRequestId);

    if (toEnrich.length === 0 && alreadyEnriched.length === 0) {
      return res.status(400).json({ error: "no_leads_to_unlock" });
    }

    // Credit check — only charge for leads that need enrichment
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
      // All leads in one campaign run share a requestId
      const requestId = toEnrich[0].lushaRequestId;
      const contactIds = toEnrich.map(l => l.lushaPersonId);

      let enrichedData;
      try {
        enrichedData = await enrich(requestId, contactIds);
      } catch (err) {
        logger.error(`unlock-leads: Lusha enrich failed for campaign ${campaign.id}: ${err.message}`);
        return res.status(502).json({ error: "lusha_enrich_failed", message: err.message });
      }

      const enrichedMap = new Map(enrichedData.map(e => [e.lushaContactId, e]));

      // Atomic: update leads + deduct credits for successful enrichments only
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
                enrichmentStatus: "UNLOCKED",
                isEnriched: true
              }
            });
            enrichedCount++;
          } else {
            failedCount++;
          }
        }
        if (enrichedCount > 0) {
          await tx.user.update({
            where: { id: req.user.sub },
            data: { credits: { decrement: enrichedCount } }
          });
        }
      });
    }

    const totalUnlocked = enrichedCount + alreadyEnriched.length;
    if (totalUnlocked === 0) {
      return res.status(422).json({ error: "enrichment_failed", enriched: 0, failed: failedCount });
    }

    // Queue email generation for all UNLOCKED leads that have email
    const unlockedLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id, isEnriched: true, email: { not: null } }
    });

    // Fire-and-forget: generate AI summary for newly enriched leads
    const newlyEnrichedLeads = unlockedLeads.filter(l => !l.aiSummary);
    if (newlyEnrichedLeads.length > 0) {
      Promise.allSettled(
        newlyEnrichedLeads.map(lead =>
          generateLeadSummary(lead, campaign.rawGoal)
            .then(summary => prisma.lead.update({ where: { id: lead.id }, data: { aiSummary: summary.trim() } }))
            .catch(err => logger.warn(`ai-summary: failed for lead ${lead.id}: ${err.message}`))
        )
      );
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "READY_FOR_OUTREACH" }
    });

    const boss = await getBoss();
    for (const lead of unlockedLeads) {
      await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
    }

    res.json({
      enriched: enrichedCount,
      failed: failedCount,
      skipped: alreadyEnriched.length,
      emailsQueued: unlockedLeads.length
    });
  } catch (e) { next(e); }
});

const templateSchema = z.discriminatedUnion("emailMode", [
  z.object({ emailMode: z.literal("AI") }),
  z.object({
    emailMode: z.literal("TEMPLATE"),
    subject: z.string().min(1),
    body: z.string().min(1)
  })
]);

router.post("/:id/template/generate", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const draft = await generateTemplateEmailImpl(campaign.rawGoal, brandFields);
    res.json(draft);
  } catch (e) { next(e); }
});

router.get("/:id/template", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    res.json({
      emailMode: campaign.emailMode,
      emailTemplateSubject: campaign.emailTemplateSubject,
      emailTemplateBody: campaign.emailTemplateBody
    });
  } catch (e) { next(e); }
});

router.put("/:id/template", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input", issues: parsed.error.issues });
    const { emailMode, subject, body } = parsed.data;
    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        emailMode,
        emailTemplateSubject: emailMode === "TEMPLATE" ? subject : null,
        emailTemplateBody: emailMode === "TEMPLATE" ? body : null
      }
    });
    res.json({
      emailMode: updated.emailMode,
      emailTemplateSubject: updated.emailTemplateSubject,
      emailTemplateBody: updated.emailTemplateBody
    });
  } catch (e) { next(e); }
});

export default router;
