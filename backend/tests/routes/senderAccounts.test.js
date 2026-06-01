import request from "supertest";
import { jest } from "@jest/globals";
import { createApp } from "../../app.js";
import { __setListAccountsImpl } from "../../routes/senderAccounts.js";
import { prisma } from "../../lib/prisma.js";
import { createUser, authHeader } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { stopBoss } from "../../lib/pgboss.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  __setListAccountsImpl(async () => [
    { accountId: "acc_1", email: "alice@nstx.co.in", status: "active" },
    { accountId: "acc_2", email: "bob@nstx.co.in", status: "warming_up" }
  ]);
});

afterAll(async () => { await stopBoss(); });

describe("POST /api/sender-accounts/sync", () => {
  test("admin can sync accounts from Instantly", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .post("/api/sender-accounts/sync")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(2);
    expect(res.body.senders.map(s => s.email)).toContain("alice@nstx.co.in");
  });

  test("manager cannot sync", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "mgr@x.com" });
    const res = await request(app)
      .post("/api/sender-accounts/sync")
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("sync is idempotent — re-syncing updates existing records", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    const res = await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(2);
  });
});

describe("GET /api/sender-accounts", () => {
  test("admin sees all synced senders with assignments", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    const res = await request(app).get("/api/sender-accounts").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.senders).toHaveLength(2);
    expect(res.body.senders[0]).toHaveProperty("assignments");
  });
});

describe("POST /api/sender-accounts/:email/assign", () => {
  test("admin can assign a sender to a user", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const { user: target } = await createUser({ role: "MANAGER", email: "mgr2@x.com" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));

    const res = await request(app)
      .post("/api/sender-accounts/alice@nstx.co.in/assign")
      .set(authHeader(token))
      .send({ userId: target.id });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  test("returns 404 for unknown sender email", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const { user: target } = await createUser({ role: "MANAGER", email: "mgr3@x.com" });
    const res = await request(app)
      .post("/api/sender-accounts/nobody@x.com/assign")
      .set(authHeader(token))
      .send({ userId: target.id });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/sender-accounts/:email/assign/:userId", () => {
  test("admin can unassign a sender from a user", async () => {
    const { token } = await createUser({ role: "ADMIN" });
    const { user: target } = await createUser({ role: "MANAGER", email: "mgr4@x.com" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(token));
    await request(app)
      .post("/api/sender-accounts/alice@nstx.co.in/assign")
      .set(authHeader(token))
      .send({ userId: target.id });

    const res = await request(app)
      .delete(`/api/sender-accounts/alice@nstx.co.in/assign/${target.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);

    // target user's senders should now be empty
    const assignment = await prisma.userSenderAccount.findFirst({ where: { userId: target.id } });
    expect(assignment).toBeNull();
  });
});

describe("GET /api/sender-accounts/mine", () => {
  test("returns only the current user's assigned senders", async () => {
    const { token: adminToken } = await createUser({ role: "ADMIN" });
    const { user: mgr, token: mgrToken } = await createUser({ role: "MANAGER", email: "mgr5@x.com" });
    await request(app).post("/api/sender-accounts/sync").set(authHeader(adminToken));
    await request(app)
      .post("/api/sender-accounts/alice@nstx.co.in/assign")
      .set(authHeader(adminToken))
      .send({ userId: mgr.id });

    const res = await request(app).get("/api/sender-accounts/mine").set(authHeader(mgrToken));
    expect(res.status).toBe(200);
    expect(res.body.senders).toHaveLength(1);
    expect(res.body.senders[0].email).toBe("alice@nstx.co.in");
  });

  test("returns empty array when user has no assigned senders", async () => {
    const { token } = await createUser({ role: "MANAGER", email: "mgr6@x.com" });
    const res = await request(app).get("/api/sender-accounts/mine").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.senders).toEqual([]);
  });
});
