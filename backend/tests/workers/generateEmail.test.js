import { jest } from "@jest/globals";
import { runGenerateEmailJob, __setGenerateDraft } from "../../workers/generateEmail.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

beforeEach(async () => {
  await resetDb();
  __setGenerateDraft(jest.fn().mockResolvedValue({
    subject: "Test subject",
    body: "Hi there,\nTest body."
  }));
});

describe("generateEmail worker", () => {
  test("creates Email row linked to lead", async () => {
    const { user } = await createUser({ email: `u${Date.now()}${Math.random()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", title: "CTO", company: "Acme", campaignId: campaign.id }
    });
    await runGenerateEmailJob({ data: { leadId: lead.id } });
    const emails = await prisma.email.findMany({ where: { leadId: lead.id } });
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe("Test subject");
    expect(emails[0].status).toBe("DRAFT");
    expect(emails[0].version).toBe(1);
  });

  test("passes brand doc content to generateDraft when it exists", async () => {
    const { user } = await createUser({ email: `bd${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.create({
      data: { id: "singleton", content: "NST brand content" }
    });

    let capturedOpts = null;
    __setGenerateDraft(jest.fn().mockImplementation(async (_lead, _profile, opts) => {
      capturedOpts = opts;
      return { subject: "Test", body: "Body" };
    }));

    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
    });

    await runGenerateEmailJob({ data: { leadId: lead.id } });
    expect(capturedOpts).toHaveProperty("brandDoc", "NST brand content");
  });

  test("passes null brandDoc to generateDraft when no brand doc exists", async () => {
    const { user } = await createUser({ email: `noBd${Date.now()}@x.com` });
    let capturedOpts = null;
    __setGenerateDraft(jest.fn().mockImplementation(async (_lead, _profile, opts) => {
      capturedOpts = opts;
      return { subject: "S", body: "B" };
    }));
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
    });
    await runGenerateEmailJob({ data: { leadId: lead.id } });
    expect(capturedOpts).toHaveProperty("brandDoc", null);
  });

  test("sets campaign to AWAITING_EMAIL_APPROVAL when last lead gets its email (autoDispatch)", async () => {
    const { user } = await createUser({ email: `gate${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    // Create two leads, both with emails
    const lead1 = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", company: "Acme", campaignId: campaign.id }
    });
    const lead2 = await prisma.lead.create({
      data: { firstName: "C", lastName: "D", email: "c@d.com", company: "Beta", campaignId: campaign.id }
    });

    // Generate email for lead1 — still one pending, should NOT set approval status
    await runGenerateEmailJob({ data: { leadId: lead1.id, autoDispatch: true } });
    let updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("DRAFT");

    // Generate email for lead2 — now zero pending, should set AWAITING_EMAIL_APPROVAL
    await runGenerateEmailJob({ data: { leadId: lead2.id, autoDispatch: true } });
    updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_EMAIL_APPROVAL");
  });

  test("bumps version on regeneration", async () => {
    const { user } = await createUser({ email: `u2${Date.now()}${Math.random()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@b.com", campaignId: campaign.id }
    });
    await runGenerateEmailJob({ data: { leadId: lead.id } });
    await runGenerateEmailJob({ data: { leadId: lead.id } });
    const emails = await prisma.email.findMany({ where: { leadId: lead.id }, orderBy: { version: "asc" } });
    expect(emails).toHaveLength(2);
    expect(emails[1].version).toBe(2);
  });
});
