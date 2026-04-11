import request from "supertest";
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { signToken } from "../../lib/auth.js";

function makeApp() {
  const app = express();
  app.get("/admin", requireAuth, requireRole("ADMIN"), (_req, res) => res.json({ ok: true }));
  app.get("/mgr", requireAuth, requireRole("ADMIN", "MANAGER"), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("requireRole", () => {
  test("403 when role not permitted", async () => {
    const token = signToken({ sub: "u1", role: "VIEWER" });
    const res = await request(makeApp()).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("200 when role matches", async () => {
    const token = signToken({ sub: "u1", role: "ADMIN" });
    const res = await request(makeApp()).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("200 when role in allow list", async () => {
    const token = signToken({ sub: "u1", role: "MANAGER" });
    const res = await request(makeApp()).get("/mgr").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
