import request from "supertest";
import { jest } from "@jest/globals";
import { createApp } from "../../app.js";
import { __setExtractFilters, __setEnrichLeadsImpl, __setGenerateTemplateEmailImpl } from "../../routes/campaigns.js";
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
  __setGenerateTemplateEmailImpl(() => { throw new Error("generateTemplateEmailImpl not mocked in this test"); });
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

  test("passes brand doc structured fields to extractFilters when set", async () => {
    const { token } = await createUser({ email: `admin${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.create({
      data: { id: "singleton", tone: "Direct", targetPersonas: "Founders at seed-stage startups" }
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

    expect(capturedOpts).toHaveProperty("brandFields");
    expect(capturedOpts.brandFields).not.toBeNull();
    expect(capturedOpts.brandFields.tone).toBe("Direct");
  });

  test("passes null brandFields to extractFilters when no brand doc set", async () => {
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
    expect(capturedOpts).toHaveProperty("brandFields", null);
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

  test("POST /api/campaigns stores senderEmail when provided", async () => {
    const { token, user } = await createUser({ role: "MANAGER", email: "mgr_sender@x.com" });

    // Create a sender account and assign it to this user
    await prisma.senderAccount.create({
      data: { accountId: "acc_s1", email: "alice@nstx.co.in", status: "active" }
    });
    await prisma.userSenderAccount.create({
      data: { userId: user.id, senderEmail: "alice@nstx.co.in" }
    });

    const res = await request(app)
      .post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "Sender Test", rawGoal: "Engineers at startups", senderEmail: "alice@nstx.co.in" });

    expect(res.status).toBe(201);
    expect(res.body.campaign.senderEmail).toBe("alice@nstx.co.in");
  });

  test("POST /api/campaigns rejects senderEmail not assigned to user", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "mgr_nosender@x.com" });

    await prisma.senderAccount.create({
      data: { accountId: "acc_s2", email: "other@nstx.co.in", status: "active" }
    });
    // Note: NOT assigned to this user

    const res = await request(app)
      .post("/api/campaigns")
      .set(authHeader(token))
      .send({ name: "Sender Test 2", rawGoal: "Engineers at startups", senderEmail: "other@nstx.co.in" });

    expect(res.status).toBe(403);
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
        { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id, isEnriched: true, enrichmentStatus: "UNLOCKED" },
        { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id, isEnriched: true, enrichmentStatus: "UNLOCKED" }
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

  test("POST /approve-leads with approvedIds only enqueues approved leads", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `alidx${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({ data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id, isEnriched: true, enrichmentStatus: "UNLOCKED" } }),
      prisma.lead.create({ data: { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id, isEnriched: true, enrichmentStatus: "UNLOCKED" } })
    ]);

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token))
      .send({ approvedIds: [lead1.id] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const skipped = await prisma.lead.findUnique({ where: { id: lead2.id } });
    expect(skipped.status).toBe("SKIPPED");

    const approved = await prisma.lead.findUnique({ where: { id: lead1.id } });
    expect(approved.status).toBe("NEW");

    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });

  test("POST /approve-leads returns 409 when all leads are skipped via approvedIds", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `alskip${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
    });
    await prisma.lead.create({
      data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token))
      .send({ approvedIds: [] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("no_leads_with_email");
  });

  test("POST /approve-leads with approvedIds skips pre-SKIPPED leads even if included", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `alskip2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_APPROVAL", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({ data: { firstName: "A", lastName: "B", email: "a@x.com", company: "X", campaignId: campaign.id, isEnriched: true, enrichmentStatus: "UNLOCKED" } }),
      prisma.lead.create({ data: { firstName: "C", lastName: "D", email: "c@x.com", company: "Y", campaignId: campaign.id, isEnriched: true, enrichmentStatus: "UNLOCKED", status: "SKIPPED" } })
    ]);

    // Pass both IDs — lead2 is already SKIPPED and should not be re-enqueued
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/approve-leads`)
      .set(authHeader(token))
      .send({ approvedIds: [lead1.id, lead2.id] });

    expect(res.status).toBe(200);

    // lead2 should still be SKIPPED (not re-activated)
    const skipped = await prisma.lead.findUnique({ where: { id: lead2.id } });
    expect(skipped.status).toBe("SKIPPED");

    // Campaign should be RUNNING (lead1 was processed)
    const updated = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updated.status).toBe("RUNNING");
  });
});

describe("select-leads", () => {
  test("stores user selections in LeadSelection table", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({ data: { firstName: "A", lastName: "B", company: "X", campaignId: campaign.id } }),
      prisma.lead.create({ data: { firstName: "C", lastName: "D", company: "Y", campaignId: campaign.id } })
    ]);

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [lead1.id] });

    expect(res.status).toBe(200);
    expect(res.body.selected).toBe(1);

    const selections = await prisma.leadSelection.findMany({ where: { campaignId: campaign.id, userId: user.id } });
    expect(selections).toHaveLength(1);
    expect(selections[0].leadId).toBe(lead1.id);
  });

  test("replaces previous selection atomically on repeat call", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl2${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({ data: { firstName: "A", lastName: "B", company: "X", campaignId: campaign.id } }),
      prisma.lead.create({ data: { firstName: "C", lastName: "D", company: "Y", campaignId: campaign.id } })
    ]);

    await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [lead1.id] });

    // Change selection to lead2 only
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [lead2.id] });

    expect(res.status).toBe(200);
    expect(res.body.selected).toBe(1);

    const selections = await prisma.leadSelection.findMany({ where: { campaignId: campaign.id, userId: user.id } });
    expect(selections).toHaveLength(1);
    expect(selections[0].leadId).toBe(lead2.id);
  });

  test("returns 409 if campaign not in AWAITING_LEAD_SELECTION", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl3${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_status");
  });

  test("returns 400 for invalid body", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: "not-an-array" });
    expect(res.status).toBe(400);
  });

  test("silently ignores lead IDs from a different campaign", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `sl5${Date.now()}@x.com` });
    const { user: user2 } = await createUser({ role: "MANAGER", email: `sl5b${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const otherCampaign = await prisma.campaign.create({
      data: { name: "Other", rawGoal: "goal", extractedFilters: {}, createdById: user2.id }
    });
    const foreignLead = await prisma.lead.create({
      data: { firstName: "X", lastName: "Y", company: "Z", campaignId: otherCampaign.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/select-leads`)
      .set(authHeader(token))
      .send({ leadIds: [foreignLead.id] });

    expect(res.status).toBe(200);
    expect(res.body.selected).toBe(0);

    const selections = await prisma.leadSelection.findMany({ where: { campaignId: campaign.id } });
    expect(selections).toHaveLength(0);
  });
});

describe("template routes", () => {
    async function makeCampaign(token) {
      const res = await request(app)
        .post("/api/campaigns")
        .set(authHeader(token))
        .send({ name: "T", rawGoal: "find engineers in India" });
      return res.body.campaign.id;
    }

    test("GET /:id/template returns default AI mode with null fields", async () => {
      const { token } = await createUser({ email: `tmpl1${Date.now()}@x.com`, role: "MANAGER" });
      const id = await makeCampaign(token);
      const res = await request(app)
        .get(`/api/campaigns/${id}/template`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        emailMode: "AI",
        emailTemplateSubject: null,
        emailTemplateBody: null
      });
    });

    test("PUT /:id/template saves template and switches to TEMPLATE mode", async () => {
      const { token } = await createUser({ email: `tmpl2${Date.now()}@x.com`, role: "MANAGER" });
      const id = await makeCampaign(token);
      const res = await request(app)
        .put(`/api/campaigns/${id}/template`)
        .set(authHeader(token))
        .send({ emailMode: "TEMPLATE", subject: "Hi {{firstName}}", body: "Join us at {{company}}" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        emailMode: "TEMPLATE",
        emailTemplateSubject: "Hi {{firstName}}",
        emailTemplateBody: "Join us at {{company}}"
      });
    });

    test("PUT /:id/template returns 400 when TEMPLATE mode but subject is empty", async () => {
      const { token } = await createUser({ email: `tmpl3${Date.now()}@x.com`, role: "MANAGER" });
      const id = await makeCampaign(token);
      const res = await request(app)
        .put(`/api/campaigns/${id}/template`)
        .set(authHeader(token))
        .send({ emailMode: "TEMPLATE", subject: "", body: "body text" });
      expect(res.status).toBe(400);
    });

    test("PUT /:id/template returns 400 when TEMPLATE mode but body is empty", async () => {
      const { token } = await createUser({ email: `tmpl4${Date.now()}@x.com`, role: "MANAGER" });
      const id = await makeCampaign(token);
      const res = await request(app)
        .put(`/api/campaigns/${id}/template`)
        .set(authHeader(token))
        .send({ emailMode: "TEMPLATE", subject: "Subject", body: "" });
      expect(res.status).toBe(400);
    });

    test("PUT /:id/template allows switching back to AI mode without subject/body", async () => {
      const { token } = await createUser({ email: `tmpl5${Date.now()}@x.com`, role: "MANAGER" });
      const id = await makeCampaign(token);
      const res = await request(app)
        .put(`/api/campaigns/${id}/template`)
        .set(authHeader(token))
        .send({ emailMode: "AI" });
      expect(res.status).toBe(200);
      expect(res.body.emailMode).toBe("AI");
    });

    test("PUT /:id/template returns 403 for VIEWER", async () => {
      const { token: managerToken } = await createUser({ email: `tmpl6m${Date.now()}@x.com`, role: "MANAGER" });
      const { token: viewerToken } = await createUser({ email: `tmpl6v${Date.now()}@x.com`, role: "VIEWER" });
      const id = await makeCampaign(managerToken);
      const res = await request(app)
        .put(`/api/campaigns/${id}/template`)
        .set(authHeader(viewerToken))
        .send({ emailMode: "TEMPLATE", subject: "S", body: "B" });
      expect(res.status).toBe(403);
    });

    test("GET /:id/template returns 404 for unknown campaign", async () => {
      const { token } = await createUser({ email: `tmpl7${Date.now()}@x.com`, role: "MANAGER" });
      const res = await request(app)
        .get("/api/campaigns/nonexistent-id/template")
        .set(authHeader(token));
      expect(res.status).toBe(404);
    });

    test("POST /:id/template/generate returns subject and body", async () => {
      const { token } = await createUser({ email: `tgen1${Date.now()}@x.com`, role: "MANAGER" });
      const id = await makeCampaign(token);
      __setGenerateTemplateEmailImpl(jest.fn().mockResolvedValue({
        subject: "Scale hiring at {{company}}",
        body: "Hi {{firstName}}, I saw you're {{title}} at {{company}}..."
      }));
      const res = await request(app)
        .post(`/api/campaigns/${id}/template/generate`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        subject: "Scale hiring at {{company}}",
        body: expect.stringContaining("{{firstName}}")
      });
    });

    test("POST /:id/template/generate returns 404 for unknown campaign", async () => {
      const { token } = await createUser({ email: `tgen2${Date.now()}@x.com`, role: "MANAGER" });
      __setGenerateTemplateEmailImpl(jest.fn().mockResolvedValue({ subject: "S", body: "B" }));
      const res = await request(app)
        .post("/api/campaigns/nonexistent-id/template/generate")
        .set(authHeader(token));
      expect(res.status).toBe(404);
    });

    test("POST /:id/template/generate returns 403 for VIEWER", async () => {
      const { token: managerToken } = await createUser({ email: `tgen3m${Date.now()}@x.com`, role: "MANAGER" });
      const { token: viewerToken } = await createUser({ email: `tgen3v${Date.now()}@x.com`, role: "VIEWER" });
      const id = await makeCampaign(managerToken);
      const res = await request(app)
        .post(`/api/campaigns/${id}/template/generate`)
        .set(authHeader(viewerToken));
      expect(res.status).toBe(403);
    });
  });

describe("unlock-leads", () => {
  beforeEach(() => {
    __setEnrichLeadsImpl(jest.fn().mockImplementation(async (_reqId, contactIds) =>
      contactIds.map(id => ({
        lushaContactId: id,
        email: `${id}@enriched.com`,
        phone: "+911234567890",
        linkedinUrl: `https://linkedin.com/in/${id}`,
        location: "India",
        department: "Engineering & Technical",
        seniority: "director"
      }))
    ));
  });

  test("enriches selected leads, deducts credits, moves to READY_FOR_OUTREACH", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul${Date.now()}@x.com` });
    await prisma.user.update({ where: { id: user.id }, data: { credits: 10 } });

    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: {
        firstName: "A", lastName: "B", company: "X", campaignId: campaign.id,
        lushaPersonId: "c-1", lushaRequestId: "req-abc"
      }
    });
    // Select the lead first
    await prisma.leadSelection.create({ data: { userId: user.id, campaignId: campaign.id, leadId: lead.id } });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.enriched).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(res.body.skipped).toBe(0);

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead.isEnriched).toBe(true);
    expect(updatedLead.enrichmentStatus).toBe("UNLOCKED");
    expect(updatedLead.email).toBe("c-1@enriched.com");
    expect(updatedLead.phone).toBe("+911234567890");

    const updatedCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updatedCampaign.status).toBe("READY_FOR_OUTREACH");

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.credits).toBe(9);
  });

  test("returns 402 when user has insufficient credits", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul2${Date.now()}@x.com` });
    await prisma.user.update({ where: { id: user.id }, data: { credits: 0 } });

    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const lead = await prisma.lead.create({
      data: { firstName: "A", lastName: "B", company: "X", campaignId: campaign.id, lushaPersonId: "c-10", lushaRequestId: "req-x" }
    });
    await prisma.leadSelection.create({ data: { userId: user.id, campaignId: campaign.id, leadId: lead.id } });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(402);
    expect(res.body.error).toBe("insufficient_credits");
    expect(res.body.required).toBe(1);
    expect(res.body.available).toBe(0);

    // Lead not modified, credits not touched
    const unchanged = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(unchanged.isEnriched).toBe(false);
    const unchangedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchangedUser.credits).toBe(0);
  });

  test("skips already-enriched leads and does not charge for them", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul3${Date.now()}@x.com` });
    await prisma.user.update({ where: { id: user.id }, data: { credits: 10 } });

    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const enrichedLead = await prisma.lead.create({
      data: {
        firstName: "A", lastName: "B", company: "X", email: "already@x.com",
        campaignId: campaign.id, lushaPersonId: "c-20", lushaRequestId: "req-y",
        isEnriched: true, enrichmentStatus: "UNLOCKED"
      }
    });
    await prisma.leadSelection.create({ data: { userId: user.id, campaignId: campaign.id, leadId: enrichedLead.id } });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.enriched).toBe(0);
    expect(res.body.skipped).toBe(1);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.credits).toBe(10);

    const updatedCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(updatedCampaign.status).toBe("READY_FOR_OUTREACH");
  });

  test("returns 400 when no leads are selected", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul4${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_leads_selected");
  });

  test("returns 409 if campaign not in AWAITING_LEAD_SELECTION", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul5${Date.now()}@x.com` });
    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "DRAFT", createdById: user.id }
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_status");
  });

  test("partial enrichment failure — only charges for successfully enriched leads", async () => {
    const { user, token } = await createUser({ role: "MANAGER", email: `ul6${Date.now()}@x.com` });
    await prisma.user.update({ where: { id: user.id }, data: { credits: 10 } });

    // Enrich returns success only for c-success, not c-fail
    __setEnrichLeadsImpl(jest.fn().mockResolvedValue([
      { lushaContactId: "c-success", email: "success@x.com", phone: null, linkedinUrl: null, location: null, department: null, seniority: null }
      // c-fail is missing from response — simulates partial Lusha failure
    ]));

    const campaign = await prisma.campaign.create({
      data: { name: "G", rawGoal: "goal", extractedFilters: {}, status: "AWAITING_LEAD_SELECTION", createdById: user.id }
    });
    const [lead1, lead2] = await Promise.all([
      prisma.lead.create({ data: { firstName: "A", lastName: "B", company: "X", campaignId: campaign.id, lushaPersonId: "c-success", lushaRequestId: "req-p" } }),
      prisma.lead.create({ data: { firstName: "C", lastName: "D", company: "Y", campaignId: campaign.id, lushaPersonId: "c-fail", lushaRequestId: "req-p" } })
    ]);
    await prisma.leadSelection.createMany({
      data: [
        { userId: user.id, campaignId: campaign.id, leadId: lead1.id },
        { userId: user.id, campaignId: campaign.id, leadId: lead2.id }
      ]
    });

    const res = await request(app)
      .post(`/api/campaigns/${campaign.id}/unlock-leads`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.enriched).toBe(1);
    expect(res.body.failed).toBe(1);

    // Only 1 credit deducted — not 2
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.credits).toBe(9);

    const successLead = await prisma.lead.findUnique({ where: { id: lead1.id } });
    expect(successLead.isEnriched).toBe(true);
    expect(successLead.enrichmentStatus).toBe("UNLOCKED");

    const failLead = await prisma.lead.findUnique({ where: { id: lead2.id } });
    expect(failLead.isEnriched).toBe(false);
    expect(failLead.enrichmentStatus).toBe("PREVIEW");
  });
});
