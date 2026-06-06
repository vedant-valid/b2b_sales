import { getBrandDoc, formatBrandGuidelines } from "../../services/brandDoc.js";
import { prisma } from "../../lib/prisma.js";
import { resetDb } from "../setup.js";

beforeEach(resetDb);

describe("getBrandDoc", () => {
  test("returns null when no brand doc exists", async () => {
    const doc = await getBrandDoc();
    expect(doc).toBeNull();
  });

  test("returns structured fields when brand doc exists", async () => {
    await prisma.brandDoc.create({
      data: { id: "singleton", tone: "Professional", proofPoints: "3x pipeline for Acme" }
    });
    const doc = await getBrandDoc();
    expect(doc).not.toBeNull();
    expect(doc.tone).toBe("Professional");
    expect(doc.proofPoints).toBe("3x pipeline for Acme");
    expect(doc.campaignGoals).toBeNull();
  });
});

describe("formatBrandGuidelines", () => {
  test("returns null when fields is null", () => {
    expect(formatBrandGuidelines(null)).toBeNull();
  });

  test("returns null when all fields are null/empty", () => {
    expect(formatBrandGuidelines({ tone: null, campaignGoals: null, targetPersonas: null, proofPoints: null, bannedWords: null })).toBeNull();
  });

  test("includes tone when set", () => {
    const result = formatBrandGuidelines({ tone: "Professional, concise" });
    expect(result).toContain("Tone: Professional, concise");
  });

  test("includes campaign goals when set", () => {
    const result = formatBrandGuidelines({ campaignGoals: "Book demo calls" });
    expect(result).toContain("Campaign goals: Book demo calls");
  });

  test("formats proof points as bullet list", () => {
    const result = formatBrandGuidelines({ proofPoints: "3x pipeline\nSaved $200K" });
    expect(result).toContain("• 3x pipeline");
    expect(result).toContain("• Saved $200K");
  });

  test("includes banned words when set", () => {
    const result = formatBrandGuidelines({ bannedWords: "synergy, leverage" });
    expect(result).toContain("Banned words (never use): synergy, leverage");
  });

  test("omits missing fields from output", () => {
    const result = formatBrandGuidelines({ tone: "Direct" });
    expect(result).not.toContain("Campaign goals");
    expect(result).not.toContain("Proof points");
  });

  test("starts with BRAND GUIDELINES header", () => {
    const result = formatBrandGuidelines({ tone: "Direct" });
    expect(result).toMatch(/^BRAND GUIDELINES/);
  });
});
