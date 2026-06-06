import { jest } from "@jest/globals";
import { extractBrandFields, extractTextFromBuffer } from "../../services/docExtract.js";

describe("extractBrandFields", () => {
  test("returns structured fields from document text", async () => {
    const fakeGen = jest.fn().mockResolvedValue({
      tone: "Professional, concise",
      campaignGoals: "Book demo calls with CTOs",
      targetPersonas: "CTOs at Series B SaaS",
      proofPoints: "3x pipeline for Acme",
      bannedWords: "synergy, leverage"
    });
    const result = await extractBrandFields("...some doc text...", { generate: fakeGen });
    expect(result.tone).toBe("Professional, concise");
    expect(result.campaignGoals).toBe("Book demo calls with CTOs");
    expect(result.bannedWords).toBe("synergy, leverage");
    expect(fakeGen).toHaveBeenCalledTimes(1);
    const [prompt] = fakeGen.mock.calls[0];
    expect(prompt).toContain("some doc text");
  });

  test("returns nulls for fields not found in document", async () => {
    const fakeGen = jest.fn().mockResolvedValue({
      tone: "Casual",
      campaignGoals: null,
      targetPersonas: null,
      proofPoints: null,
      bannedWords: null
    });
    const result = await extractBrandFields("minimal doc", { generate: fakeGen });
    expect(result.tone).toBe("Casual");
    expect(result.campaignGoals).toBeNull();
  });
});

describe("extractTextFromBuffer", () => {
  test("throws for unsupported mime type", async () => {
    const buf = Buffer.from("hello");
    await expect(extractTextFromBuffer(buf, "text/plain")).rejects.toThrow("unsupported_file_type");
  });
});
