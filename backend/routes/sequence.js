import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { prisma } from "../lib/prisma.js";
import {
  generateSequence as realGenerateSequence,
  reviseSequence as realReviseSequence,
} from "../services/emailGen.js";
import { updateCampaignSequence as realUpdateCampaignSequence } from "../services/instantly.js";

const router = Router();
router.use(requireAuth);

let generateSequenceFn = realGenerateSequence;
let reviseSequenceFn = realReviseSequence;
export function __setGenerateSequenceImpl(fn) { generateSequenceFn = fn; }
export function __setReviseSequenceImpl(fn) { reviseSequenceFn = fn; }

let instantly = { updateCampaignSequence: realUpdateCampaignSequence };
export function __setInstantlyImpl(impl) { instantly = impl; }

const stepSchema = z.object({
  stepNumber: z.number().int().positive(),
  subject: z.string().min(1).max(60),
  body: z.string().min(1),
  delayDays: z.number().int().min(0),
});
const saveSchema = z.object({ steps: z.array(stepSchema).min(1).max(10) });
const reviseSchema = z.object({ prompt: z.string().min(1).max(1000) });

async function getCampaignOrFail(id, res) {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) { res.status(404).json({ error: "not_found" }); return null; }
  return campaign;
}

async function replaceSteps(campaignId, steps) {
  return prisma.$transaction(async (tx) => {
    await tx.sequenceStep.deleteMany({ where: { campaignId } });
    await tx.sequenceStep.createMany({
      data: steps.map(s => ({
        campaignId,
        stepNumber: s.stepNumber,
        subject: s.subject,
        body: s.body,
        delayDays: s.delayDays,
      })),
    });
    await tx.campaign.update({ where: { id: campaignId }, data: { sequenceApproved: false } });
    return tx.sequenceStep.findMany({ where: { campaignId }, orderBy: { stepNumber: "asc" } });
  });
}

// GET /api/campaigns/:id/sequence
router.get("/:id/sequence", async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const steps = await prisma.sequenceStep.findMany({
      where: { campaignId: campaign.id },
      orderBy: { stepNumber: "asc" },
    });
    res.json({ steps, sequenceApproved: campaign.sequenceApproved });
  } catch (e) { next(e); }
});

// POST /api/campaigns/:id/sequence/generate
router.post("/:id/sequence/generate", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const raw = await generateSequenceFn(campaign.rawGoal, brandFields);
    const validation = z.array(stepSchema).safeParse(raw);
    if (!validation.success) return res.status(502).json({ error: "ai_output_invalid", message: "AI returned an invalid sequence format — please try again." });
    const steps = await replaceSteps(campaign.id, validation.data);
    res.json({ steps });
  } catch (e) { next(e); }
});

// PUT /api/campaigns/:id/sequence  (save inline edits)
router.put("/:id/sequence", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input", issues: parsed.error.issues });
    const steps = await replaceSteps(campaign.id, parsed.data.steps);
    res.json({ steps });
  } catch (e) { next(e); }
});

// POST /api/campaigns/:id/sequence/revise
router.post("/:id/sequence/revise", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const parsed = reviseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input", issues: parsed.error.issues });
    const current = await prisma.sequenceStep.findMany({
      where: { campaignId: campaign.id },
      orderBy: { stepNumber: "asc" },
    });
    if (current.length === 0) return res.status(400).json({ error: "no_sequence", message: "Generate a sequence first." });
    const brandFields = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const raw = await reviseSequenceFn(current, parsed.data.prompt, brandFields);
    const validation = z.array(stepSchema).safeParse(raw);
    if (!validation.success) return res.status(502).json({ error: "ai_output_invalid", message: "AI returned an invalid sequence format — please try again." });
    const steps = await replaceSteps(campaign.id, validation.data);
    res.json({ steps });
  } catch (e) { next(e); }
});

// POST /api/campaigns/:id/sequence/approve
router.post("/:id/sequence/approve", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await getCampaignOrFail(req.params.id, res);
    if (!campaign) return;
    const steps = await prisma.sequenceStep.findMany({
      where: { campaignId: campaign.id },
      orderBy: { stepNumber: "asc" },
    });
    if (steps.length === 0) return res.status(400).json({ error: "no_sequence", message: "Generate a sequence before approving." });

    // If the campaign is already dispatched, push the approved sequence to the live
    // Instantly campaign too — otherwise edits made after dispatch never reach Instantly.
    if (campaign.instantlyCampaignId) {
      await instantly.updateCampaignSequence(campaign.instantlyCampaignId, steps);
    }

    await prisma.campaign.update({ where: { id: campaign.id }, data: { sequenceApproved: true } });
    res.json({ sequenceApproved: true });
  } catch (e) { next(e); }
});

export default router;
