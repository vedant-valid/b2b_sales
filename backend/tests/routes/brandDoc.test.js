import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser, authHeader } from "../helpers/factory.js";

const app = createApp();

beforeEach(resetDb);

describe("GET /api/brand-doc", () => {
  test("returns null when no brand doc set", async () => {
    const { token } = await createUser({ email: `v${Date.now()}@x.com` });
    const res = await request(app)
      .get("/api/brand-doc")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.brandDoc).toBeNull();
  });

  test("returns brand doc content when set", async () => {
    const { user, token } = await createUser({ email: `a${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.create({
      data: { id: "singleton", content: "NST guidelines" }
    });
    const res = await request(app)
      .get("/api/brand-doc")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.content).toBe("NST guidelines");
  });

  test("requires auth", async () => {
    const res = await request(app).get("/api/brand-doc");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/brand-doc", () => {
  test("ADMIN can save brand doc", async () => {
    const { token } = await createUser({ email: `admin${Date.now()}@x.com`, role: "ADMIN" });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ content: "Our brand voice is direct and specific.", fileName: "brand.txt" });
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.content).toBe("Our brand voice is direct and specific.");
    expect(res.body.brandDoc.fileName).toBe("brand.txt");
  });

  test("ADMIN can overwrite existing brand doc", async () => {
    const { token } = await createUser({ email: `admin2${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.create({ data: { id: "singleton", content: "old content" } });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ content: "new content" });
    expect(res.status).toBe(200);
    expect(res.body.brandDoc.content).toBe("new content");
  });

  test("MANAGER cannot save brand doc", async () => {
    const { token } = await createUser({ email: `mgr${Date.now()}@x.com`, role: "MANAGER" });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ content: "some content" });
    expect(res.status).toBe(403);
  });

  test("rejects empty content", async () => {
    const { token } = await createUser({ email: `admin3${Date.now()}@x.com`, role: "ADMIN" });
    const res = await request(app)
      .post("/api/brand-doc")
      .set(authHeader(token))
      .send({ content: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_input");
  });
});
