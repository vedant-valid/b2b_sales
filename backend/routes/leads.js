import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { campaignId, status } = req.query;
    const where = {};
    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;
    const leads = await prisma.lead.findMany({
      where,
      include: {
        _count: { select: { emails: true, replies: true } },
        campaign: { select: { mode: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 500
    });
    res.json({ leads });
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
