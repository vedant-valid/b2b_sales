import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/auth.js";
import { resetDb } from "../setup.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  await prisma.user.create({
    data: { email: "a@b.com", password: await hashPassword("secret123"), role: "ADMIN" }
  });
});

describe("POST /api/auth/login", () => {
  test("returns token on valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("a@b.com");
    expect(res.body.user.password).toBeUndefined();
  });

  test("401 on wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  test("401 on unknown email", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x@y.com", password: "secret123" });
    expect(res.status).toBe(401);
  });

  test("400 on missing fields", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });
});
