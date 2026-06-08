import { jest } from "@jest/globals";
import { runFetchLeadsJob, __setLushaImpl, __setScoringImpl } from "../../workers/fetchLeads.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

beforeEach(async () => {
  await resetDb();
  __setScoringImpl({ scoreLeads: jest.fn().mockResolvedValue([]) });
});

describe("fetchLeads worker (Phase 1 — basic discovery, no credits)", () => {
  test("stores PREVIEW leads without email/phone and sets AWAITING_LEAD_SELECTION", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-1", firstName: "A", lastName: "B", title: "CTO", company: "Acme", requestId: "req-1" },
        { lushaContactId: "uuid-2", firstName: "C", lastName: "D", title: "VP Eng", company: "Beta", requestId: "req-1" }
      ])
    });

    const { user } = await createUser({ role: "MANAGER", email: `u${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: {
        name: "X", rawGoal: "g",
        extractedFilters: { seniorities: ["director"], departments: ["Engineering & Technical"], locations: ["India"] },
        createdById: user.id
      }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(2);
    // Phase 1: no email or phone — only enrichment (Phase 2) adds these
    expect(leads.every(l => l.email === null)).toBe(true);
    expect(leads.every(l => l.phone === null)).toBe(true);
    expect(leads.every(l => l.isEnriched === false)).toBe(true);
    expect(leads.every(l => l.enrichmentStatus === "PREVIEW")).toBe(true);
    expect(leads.every(l => l.lushaRequestId === "req-1")).toBe(true);
    expect(leads.map(l => l.lushaPersonId)).toEqual(expect.arrayContaining(["uuid-1", "uuid-2"]));

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_SELECTION");
  });

  test("Lusha search failure reverts status instead of leaving campaign stuck in RUNNING", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockRejectedValue(new Error("lusha_search_failed_402: credit limit"))
    });

    const { user } = await createUser({ role: "MANAGER", email: `u7${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    expect(campaign.status).toBe("DRAFT");

    await expect(runFetchLeadsJob({ data: { campaignId: campaign.id } })).rejects.toThrow(/credit limit/);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("DRAFT");
  });

  test("zero leads from Lusha → campaign COMPLETED", async () => {
    __setLushaImpl({ searchLeadsBasic: jest.fn().mockResolvedValue([]) });

    const { user } = await createUser({ role: "MANAGER", email: `u2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    await runFetchLeadsJob({ data: { campaignId: campaign.id } });
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  test("persists fitScore and fitReasoning from scoring service", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-3", firstName: "E", lastName: "F", title: "CTO", company: "Gamma", requestId: "req-2" }
      ])
    });
    __setScoringImpl({
      scoreLeads: jest.fn().mockImplementation(async (_goal, leads) =>
        leads.map(l => ({
          leadId: l.id,
          score: 82,
          bullets: ["Senior title", "Good company", "India market", "No significant gaps"]
        }))
      )
    });

    const { user } = await createUser({ role: "MANAGER", email: `u3${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "Find CTOs in India", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const [lead] = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(lead.fitScore).toBe(82);
    expect(lead.fitReasoning).toEqual(["Senior title", "Good company", "India market", "No significant gaps"]);
  });

  test("scoring failure does not block AWAITING_LEAD_SELECTION", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-5", firstName: "I", lastName: "J", title: "CTO", company: "Epsilon", requestId: "req-3" }
      ])
    });
    __setScoringImpl({ scoreLeads: jest.fn().mockRejectedValue(new Error("Gemini timeout")) });

    const { user } = await createUser({ role: "MANAGER", email: `u5${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_SELECTION");

    const [lead] = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(lead.fitScore).toBeNull();
    expect(lead.isEnriched).toBe(false);
  });

  test("no scores returned does not block AWAITING_LEAD_SELECTION", async () => {
    __setLushaImpl({
      searchLeadsBasic: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-4", firstName: "G", lastName: "H", title: "CTO", company: "Delta", requestId: "req-4" }
      ])
    });
    __setScoringImpl({ scoreLeads: jest.fn().mockResolvedValue([]) });

    const { user } = await createUser({ role: "MANAGER", email: `u4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_SELECTION");
  });
});
