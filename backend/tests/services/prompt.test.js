import { jest } from "@jest/globals";
import { extractFilters } from "../../services/prompt.js";

describe("prompt.extractFilters", () => {
  test("returns structured filters and confidence", async () => {
    const fakeGen = jest.fn().mockResolvedValue({
      filters: {
        titles: ["Head of Engineering", "VP Engineering"],
        locations: ["India"],
        companySizes: ["1001-5000"],
        industries: ["Software"]
      },
      confidence: 0.92
    });
    const result = await extractFilters("Heads of Engineering at unicorn startups in India", { generate: fakeGen });
    expect(result.filters.titles).toContain("Head of Engineering");
    expect(result.confidence).toBe(0.92);
  });

  test("low confidence returns clarification", async () => {
    const fakeGen = jest.fn().mockResolvedValue({ filters: {}, confidence: 0.4, clarification: "Please specify location" });
    const result = await extractFilters("help me hire", { generate: fakeGen });
    expect(result.needsClarification).toBe(true);
    expect(result.clarification).toMatch(/location/);
  });

  test("appends formatted brand guidelines to prompt when brandFields is provided", async () => {
    let capturedPrompt = null;
    const fakeGen = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { filters: { locations: ["India"] }, confidence: 0.9 };
    });
    await extractFilters("find engineers in India", {
      generate: fakeGen,
      brandFields: { targetPersonas: "Founders and CTOs only", tone: "Direct" }
    });
    expect(capturedPrompt).toContain("Founders and CTOs only");
    expect(capturedPrompt).toContain("Direct");
  });

  test("no brand context in prompt when brandFields is null", async () => {
    let capturedPrompt = null;
    const fakeGen = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { filters: {}, confidence: 0.9 };
    });
    await extractFilters("find engineers", { generate: fakeGen, brandFields: null });
    expect(capturedPrompt).not.toContain("BRAND GUIDELINES");
  });
});
