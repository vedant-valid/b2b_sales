import { getBrandDoc } from "../../services/brandDoc.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";

beforeEach(resetDb);

describe("brandDoc service", () => {
  test("returns null when no brand doc exists", async () => {
    const doc = await getBrandDoc();
    expect(doc).toBeNull();
  });

  test("returns content when brand doc exists", async () => {
    await prisma.brandDoc.create({
      data: { id: "singleton", content: "NST brand content" }
    });
    const doc = await getBrandDoc();
    expect(doc).not.toBeNull();
    expect(doc.content).toBe("NST brand content");
  });
});
