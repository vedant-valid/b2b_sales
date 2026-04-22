import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { getBoss } from "../lib/pgboss.js";
import { createCampaign, pushLeads, activateCampaign } from "../services/instantly.js";

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
    if (!email.lead.email) return res.status(400).json({ error: "lead_has_no_email" });

    const campaign = await prisma.campaign.findUnique({ where: { id: email.lead.campaignId } });
    if (!campaign) return res.status(400).json({ error: "campaign_not_found" });

    // Get or create the Instantly campaign
    let instantlyCampaignId = campaign.instantlyCampaignId;
    try {
      if (!instantlyCampaignId) {
        const out = await createCampaign(campaign.name);
        instantlyCampaignId = out.instantlyCampaignId;
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { instantlyCampaignId, status: "RUNNING" }
        });
      }

      // Push this lead to Instantly
      const result = await pushLeads(instantlyCampaignId, [{
        email: email.lead.email,
        firstName: email.lead.firstName,
        lastName: email.lead.lastName,
        company: email.lead.company,
        subject: email.subject,
        body: email.body,
        _leadId: email.lead.id,
        _emailId: email.id
      }]);

      // Activate the campaign so Instantly starts sending
      await activateCampaign(instantlyCampaignId);

      const rejected = new Set((result.rejected || []).map((r) => r.email));
      if (rejected.has(email.lead.email)) {
        const updated = await prisma.email.update({ where: { id: email.id }, data: { status: "FAILED" } });
        return res.status(422).json({ error: "instantly_rejected", email: updated });
      }
    } catch (instantlyErr) {
      const msg = instantlyErr.message || "";
      if (msg.includes("_401") || msg.includes("_403")) {
        return res.status(502).json({ error: "instantly_auth_failed", detail: "Instantly API key is invalid or expired. Update INSTANTLY_API_KEY in backend/.env." });
      }
      return res.status(502).json({ error: "instantly_error", detail: msg });
    }

    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { status: "SENT", sentAt: new Date() }
    });
    res.json({ email: updated });
  } catch (e) { next(e); }
});

export default router;
