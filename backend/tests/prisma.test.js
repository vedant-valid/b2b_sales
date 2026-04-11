import { prisma } from "../lib/prisma.js";

describe("prisma", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  test("can query users table", async () => {
    const count = await prisma.user.count();
    expect(typeof count).toBe("number");
  });
});
