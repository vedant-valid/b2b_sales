import { jest } from "@jest/globals";
import { runFetchLeadsJob, __setLushaImpl, __setScoringImpl } from "../../workers/fetchLeads.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

beforeEach(async () => {
  await resetDb();
  // Default no-op scoring so tests that don't care about scores still pass
  __setScoringImpl({ scoreLeads: jest.fn().mockResolvedValue([]) });
});

describe("fetchLeads worker", () => {
  test("stores enriched leads and sets status to AWAITING_LEAD_APPROVAL", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-1", firstName: "A", lastName: "B", email: "a@x.com", title: "CTO", company: "Acme", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" },
        { lushaContactId: "uuid-2", firstName: "C", lastName: "D", email: "c@x.com", title: "VP Eng", company: "Beta", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "vice president" }
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
    expect(leads.map(l => l.email)).toEqual(expect.arrayContaining(["a@x.com", "c@x.com"]));

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_APPROVAL");
  });

  test("zero leads from Lusha → campaign COMPLETED", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([])
    });

    const { user } = await createUser({ role: "MANAGER", email: `u2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    await runFetchLeadsJob({ data: { campaignId: campaign.id } });
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  test("persists fitScore and fitReasoning returned by scoring service", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-3", firstName: "E", lastName: "F", email: "e@x.com", title: "CTO", company: "Gamma", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" }
      ])
    });
    // Mock scoring to return dynamic scores based on lead IDs
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

  test("no scores returned does not block AWAITING_LEAD_APPROVAL status", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-4", firstName: "G", lastName: "H", email: "g@x.com", title: "CTO", company: "Delta", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" }
      ])
    });
    __setScoringImpl({
      scoreLeads: jest.fn().mockResolvedValue([]) // no scores returned
    });

    const { user } = await createUser({ role: "MANAGER", email: `u4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_APPROVAL");

    const [lead] = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(lead.fitScore).toBeNull();
    expect(lead.fitReasoning).toBeNull();
  });

  test("scorer throwing does not block AWAITING_LEAD_APPROVAL status", async () => {
    __setLushaImpl({
      searchLeads: jest.fn().mockResolvedValue([
        { lushaContactId: "uuid-5", firstName: "I", lastName: "J", email: "i@x.com", title: "CTO", company: "Epsilon", location: "India", linkedinUrl: null, department: "Engineering & Technical", seniority: "director" }
      ])
    });
    __setScoringImpl({
      scoreLeads: jest.fn().mockRejectedValue(new Error("Gemini timeout"))
    });

    const { user } = await createUser({ role: "MANAGER", email: `u5${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "X", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });

    await runFetchLeadsJob({ data: { campaignId: campaign.id } });

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("AWAITING_LEAD_APPROVAL");

    const [lead] = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(lead.fitScore).toBeNull();
  });
});
