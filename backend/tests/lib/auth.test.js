import { hashPassword, verifyPassword, signToken, verifyToken } from "../../lib/auth.js";

describe("auth lib", () => {
  test("hash and verify password round-trip", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  test("sign and verify JWT round-trip", () => {
    const token = signToken({ sub: "u1", role: "ADMIN" });
    const payload = verifyToken(token);
    expect(payload.sub).toBe("u1");
    expect(payload.role).toBe("ADMIN");
  });

  test("verifyToken throws on tampered token", () => {
    expect(() => verifyToken("not.a.token")).toThrow();
  });
});
