import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { extractFilters as realExtractFilters } from "../services/prompt.js";
import { getBoss } from "../lib/pgboss.js";

let extract = realExtractFilters;
export function __setExtractFilters(fn) { extract = fn; }

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
    const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const extraction = await extract(parsed.data.rawGoal, { brandDoc: brandDoc?.content ?? null });
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

export default router;
