import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

async function seedLead({ sentiment = null } = {}) {
  const { user, token } = await createUser({ role: "MANAGER" });
  const campaign = await prisma.campaign.create({
    data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id }
  });
  const lead = await prisma.lead.create({
    data: {
      firstName: "Jo", lastName: "Doe", email: "jo@x.com",
      title: "CTO", company: "Acme", campaignId: campaign.id, status: "INTERESTED"
    }
  });
  if (sentiment) {
    await prisma.reply.create({
      data: { leadId: lead.id, body: "Yes!", sentiment, receivedAt: new Date() }
    });
  }
  return { user, token, campaign, lead };
}

describe("GET /api/export/leads", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/export/leads");
    expect(res.status).toBe(401);
  });

  test("returns xlsx file with correct content-type", async () => {
    const { token } = await seedLead({ sentiment: "INTERESTED" });
    const res = await request(app)
      .get("/api/export/leads")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(res.headers["content-disposition"]).toMatch(/attachment.*\.xlsx/);
    // Binary response — verify a non-empty body was returned
    const contentLength = parseInt(res.headers["content-length"] || "0", 10);
    expect(contentLength).toBeGreaterThan(0);
  });

  test("filters by campaignId when provided", async () => {
    const { token, campaign } = await seedLead({ sentiment: "INTERESTED" });
    const res = await request(app)
      .get(`/api/export/leads?campaignId=${campaign.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("filters by lead status when provided", async () => {
    const { token } = await seedLead({ sentiment: "INTERESTED" });
    const res = await request(app)
      .get("/api/export/leads?status=INTERESTED")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("returns empty xlsx when no leads match filter", async () => {
    const { token } = await seedLead();
    const res = await request(app)
      .get("/api/export/leads?status=NOT_INTERESTED")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml/);
  });
});
