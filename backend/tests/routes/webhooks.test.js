import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../app.js";
import { __setBossImpl, __setWebhookSecret } from "../../routes/webhooks.js";
import { resetDb } from "../setup.js";

const WEBHOOK_SECRET = "test-webhook-secret";

const mockBoss = { send: jest.fn().mockResolvedValue("job-abc") };

beforeAll(() => {
  __setWebhookSecret(WEBHOOK_SECRET);
  __setBossImpl(async () => mockBoss);
});

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
});

const app = createApp();

describe("POST /api/webhooks/instantly", () => {
  test("returns 401 when secret header is missing", async () => {
    const res = await request(app)
      .post("/api/webhooks/instantly")
      .send({ event: "reply_received" });
    expect(res.status).toBe(401);
  });

  test("returns 401 when secret header is wrong", async () => {
    const res = await request(app)
      .post("/api/webhooks/instantly")
      .set("x-webhook-secret", "wrong-secret")
      .send({ event: "reply_received" });
    expect(res.status).toBe(401);
  });

  test("ignores non-reply events and returns ok", async () => {
    const res = await request(app)
      .post("/api/webhooks/instantly")
      .set("x-webhook-secret", WEBHOOK_SECRET)
      .send({ event: "email_sent" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("enqueues process-reply job and returns 202 for reply_received", async () => {
    const res = await request(app)
      .post("/api/webhooks/instantly")
      .set("x-webhook-secret", WEBHOOK_SECRET)
      .send({
        event: "reply_received",
        lead_email: "lead@company.com",
        body: "Thanks for reaching out!",
        received_at: "2024-06-01T10:00:00Z"
      });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe("job-abc");
    expect(mockBoss.send).toHaveBeenCalledWith("process-reply", {
      leadEmail: "lead@company.com",
      body: "Thanks for reaching out!",
      receivedAt: "2024-06-01T10:00:00Z"
    });
  });
});
