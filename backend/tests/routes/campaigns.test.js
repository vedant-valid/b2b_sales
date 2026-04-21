import request from "supertest";
import { createApp } from "../../app.js";
import { __setExtractFilters } from "../../routes/campaigns.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { stopBoss } from "../../lib/pgboss.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  __setExtractFilters(async () => ({
    filters: { titles: ["Head of Engineering"], locations: ["India"] },
    confidence: 0.9,
    needsClarification: false
  }));
});

afterAll(async () => { await stopBoss(); });

describe("campaigns routes", () => {
  test("POST /api/campaigns creates DRAFT with extracted filters", async () => {
    const { token } = await createUser({ role: "MANAGER" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "Q2 Hiring", rawGoal: "Heads of Engineering at unicorn startups in India" });
    expect(res.status).toBe(201);
    expect(res.body.campaign.status).toBe("DRAFT");
    expect(res.body.campaign.extractedFilters.titles).toContain("Head of Engineering");
  });

  test("POST /api/campaigns forbidden for VIEWER", async () => {
    const { token } = await createUser({ role: "VIEWER" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "X", rawGoal: "goal here" });
    expect(res.status).toBe(403);
  });

  test("POST /api/campaigns returns 422 on low-confidence extraction", async () => {
    __setExtractFilters(async () => ({
      filters: {},
      confidence: 0.3,
      needsClarification: true,
      clarification: "Please specify a target role"
    }));
    const { token } = await createUser({ role: "MANAGER", email: "m2@x.com" });
    const res = await request(app).post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "X", rawGoal: "please" });
    expect(res.status).toBe(422);
    expect(res.body.clarification).toMatch(/target role/);
  });

  test("passes brand doc content to extractFilters when set", async () => {
    const { token } = await createUser({ email: `admin${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.create({
      data: { id: "singleton", content: "ICP: Founders at seed-stage startups" }
    });

    let capturedOpts = null;
    __setExtractFilters(async (_goal, opts) => {
      capturedOpts = opts;
      return { filters: { locations: ["India"] }, confidence: 0.9, needsClarification: false };
    });

    await request(app)
      .post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "Test", rawGoal: "find engineers in India" });

    expect(capturedOpts).toHaveProperty("brandDoc", "ICP: Founders at seed-stage startups");
  });

  test("passes null brandDoc to extractFilters when no brand doc set", async () => {
    const { token } = await createUser({ email: `noBd${Date.now()}@x.com`, role: "ADMIN" });
    let capturedOpts = null;
    __setExtractFilters(async (_goal, opts) => {
      capturedOpts = opts;
      return { filters: { locations: ["India"] }, confidence: 0.9, needsClarification: false };
    });
    await request(app)
      .post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "NullTest", rawGoal: "find engineers in India" });
    expect(capturedOpts).toHaveProperty("brandDoc", null);
  });

  test("GET /api/campaigns lists user-visible campaigns", async () => {
    const { token, user } = await createUser({ role: "MANAGER", email: "m3@x.com" });
    await prisma.campaign.create({
      data: { name: "A", rawGoal: "g", extractedFilters: {}, createdById: user.id }
    });
    const res = await request(app).get("/api/campaigns").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.campaigns.length).toBe(1);
  });

  test("GET /api/campaigns/:id returns detail", async () => {
    const { token, user } = await createUser({ role: "MANAGER", email: "m4@x.com" });
    const c = await prisma.campaign.create({
      data: { name: "A", rawGoal: "g", extractedFilters: { titles: ["X"] }, createdById: user.id }
    });
    const res = await request(app).get(`/api/campaigns/${c.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.campaign.id).toBe(c.id);
  });
});

describe("approval gates", () => {
  test("POST /approve-leads enqueues generate-email and sets RUNNING", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `al${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
    });
    await prisma.lead.createMany({
      data: [
        { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id },
        { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id }
      ]
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("POST /approve-leads returns 409 if campaign not in AWAITING_LEAD_APPROVAL", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `al2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(409);
  });

  test("POST /reject-leads deletes leads and sets DRAFT", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `rl${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id }
    });
    // Create a child email to verify FK-safe deletion
    await prisma.email.create({
      data: { leadId: lead.id, subject: "Hi", body: "Body", version: 1, status: "DRAFT" }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/reject-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(0);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("DRAFT");
  });

  test("POST /approve-emails enqueues dispatch and sets RUNNING", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ae${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_EMAIL_APPROVAL", createdById: user.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-emails`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("POST /reject-emails deletes leads + emails and sets DRAFT", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `re${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "AWAITING_EMAIL_APPROVAL", createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id }
    });
    await prisma.email.create({
      data: { leadId: lead.id, subject: "Hi", body: "Body", version: 1, status: "DRAFT" }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/reject-emails`)
      .set(authHeader(token));

    expect(res.status).toBe(200);

    const emails = await prisma.email.findMany({ where: { leadId: lead.id } });
    expect(emails).toHaveLength(0);

    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id } });
    expect(leads).toHaveLength(0);

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("DRAFT");
  });

  test("POST /reject-leads returns 409 if not in AWAITING_LEAD_APPROVAL", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `rl2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/reject-leads`)
      .set(authHeader(token));
    expect(res.status).toBe(409);
  });

  test("POST /approve-emails returns 409 if not in AWAITING_EMAIL_APPROVAL", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ae2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-emails`)
      .set(authHeader(token));
    expect(res.status).toBe(409);
  });

  test("POST /reject-emails returns 409 if not in AWAITING_EMAIL_APPROVAL", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `re2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal here", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/reject-emails`)
      .set(authHeader(token));
    expect(res.status).toBe(409);
  });
});
