import { getBrandDoc } from "../../services/brandDoc.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";
import { createUser } from "../helpers/factory.js";

beforeEach(resetDb);

describe("brandDoc service", () => {
  test("returns null when no brand doc exists", async () => {
    const doc = await getBrandDoc();
    expect(doc).toBeNull();
  });

  test("returns content when brand doc exists", async () => {
    const { user } = await createUser({ email: `bd${Date.now()}@x.com`, role: "ADMIN" });
    await prisma.brandDoc.upsert({
      where: { id: "singleton" },
      update: { content: "NST brand content", uploadedById: user.id },
      create: { id: "singleton", content: "NST brand content", uploadedById: user.id }
    });
    const doc = await getBrandDoc();
    expect(doc).not.toBeNull();
    expect(doc.content).toBe("NST brand content");
  });
});
