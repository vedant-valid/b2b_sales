import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../app.js";
import { __setInstantlyImpl } from "../../routes/replies.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";

const app = createApp();

const mockInstantly = { sendSubsequence: jest.fn().mockResolvedValue(undefined) };

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
  __setInstantlyImpl(mockInstantly);
});

async function makeCampaignWithReply({ instantlyCampaignId = null } = {}) {
  const { user, token } = await createUser({ role: "MANAGER" });
  const campaign = await prisma.campaign.create({
    data: { name: "C", rawGoal: "g", extractedFilters: {}, createdById: user.id, instantlyCampaignId }
  });
  const lead = await prisma.lead.create({
    data: { firstName: "Jo", lastName: "Doe", email: "jo@x.com", campaignId: campaign.id }
  });
  const reply = await prisma.reply.create({
    data: {
      leadId: lead.id,
      body: "Sounds great!",
      sentiment: "INTERESTED",
      draftFollowUp: "How about Tuesday 10am?",
      receivedAt: new Date()
    }
  });
  return { user, token, campaign, lead, reply };
}

describe("GET /api/replies", () => {
  test("returns list of replies ordered by received date", async () => {
    const { token, reply } = await makeCampaignWithReply({ instantlyCampaignId: "cmp_abc" });
    const res = await request(app).get("/api/replies").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.replies).toHaveLength(1);
    expect(res.body.replies[0].id).toBe(reply.id);
  });

  test("filters by sentiment", async () => {
    const { token } = await makeCampaignWithReply({ instantlyCampaignId: "cmp_abc" });
    const res = await request(app)
      .get("/api/replies?sentiment=NOT_INTERESTED")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.replies).toHaveLength(0);
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/api/replies");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/replies/:id", () => {
  test("returns reply with lead and campaign", async () => {
    const { token, reply } = await makeCampaignWithReply({ instantlyCampaignId: "cmp_abc" });
    const res = await request(app).get(`/api/replies/${reply.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.reply.id).toBe(reply.id);
    expect(res.body.reply.lead).toBeDefined();
  });

  test("returns 404 for unknown id", async () => {
    const { token } = await makeCampaignWithReply({ instantlyCampaignId: "cmp_abc" });
    const res = await request(app).get("/api/replies/nonexistent-id").set(authHeader(token));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/replies/:id/approve", () => {
  test("sends follow-up via Instantly and returns ok", async () => {
    const { token, reply } = await makeCampaignWithReply({ instantlyCampaignId: "cmp_abc" });
    const res = await request(app)
      .post(`/api/replies/${reply.id}/approve`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockInstantly.sendSubsequence).toHaveBeenCalledWith(
      "cmp_abc",
      "jo@x.com",
      "How about Tuesday 10am?"
    );
  });

  test("sends custom body if provided", async () => {
    const { token, reply } = await makeCampaignWithReply({ instantlyCampaignId: "cmp_abc" });
    const res = await request(app)
      .post(`/api/replies/${reply.id}/approve`)
      .set(authHeader(token))
      .send({ body: "Custom follow-up text" });
    expect(res.status).toBe(200);
    expect(mockInstantly.sendSubsequence).toHaveBeenCalledWith(
      "cmp_abc",
      "jo@x.com",
      "Custom follow-up text"
    );
  });

  test("returns 409 when campaign not yet dispatched to Instantly", async () => {
    const { token, reply } = await makeCampaignWithReply({ instantlyCampaignId: null });
    const res = await request(app)
      .post(`/api/replies/${reply.id}/approve`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(409);
  });

  test("forbidden for VIEWER role", async () => {
    const { reply } = await makeCampaignWithReply({ instantlyCampaignId: "cmp_abc" });
    const { token } = await createUser({ role: "VIEWER", email: `v${Date.now()}@x.com` });
    const res = await request(app)
      .post(`/api/replies/${reply.id}/approve`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(403);
  });
});
