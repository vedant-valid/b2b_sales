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
