import { jest } from "@jest/globals";
import { generateSequence, reviseSequence } from "../../services/emailGen.js";

const fakeGenerate = jest.fn();

beforeEach(() => fakeGenerate.mockClear());

const currentSteps = [
  { stepNumber: 1, delayDays: 0, subject: "Old subject", body: "Old body." }
];

describe("generateSequence", () => {
  test("returns parsed steps array from AI", async () => {
    fakeGenerate.mockResolvedValueOnce([
      { stepNumber: 1, delayDays: 0, subject: "Hi {{firstName}}", body: "Step 1 body here." },
      { stepNumber: 2, delayDays: 3, subject: "Following up", body: "Step 2 follow-up body." }
    ]);
    const result = await generateSequence("Find CTOs in India", null, { generate: fakeGenerate });
    expect(result).toHaveLength(2);
    expect(result[0].stepNumber).toBe(1);
    expect(result[0].delayDays).toBe(0);
    expect(result[1].delayDays).toBe(3);
  });

  test("injects brand guidelines into systemInstruction when provided", async () => {
    fakeGenerate.mockResolvedValueOnce([
      { stepNumber: 1, delayDays: 0, subject: "Sub", body: "Body" }
    ]);
    const brandFields = { tone: "professional", campaignGoals: "book calls", targetPersonas: null, proofPoints: null, bannedWords: null };
    await generateSequence("goal", brandFields, { generate: fakeGenerate });
    const [, calledOpts] = fakeGenerate.mock.calls[0];
    expect(calledOpts.systemInstruction).toContain("professional");
  });
});

describe("reviseSequence", () => {
  test("passes current steps and user prompt to AI and returns revised steps", async () => {
    fakeGenerate.mockResolvedValueOnce([
      { stepNumber: 1, delayDays: 0, subject: "Shorter subject", body: "Short." }
    ]);
    const result = await reviseSequence(currentSteps, "make step 1 shorter", null, { generate: fakeGenerate });
    expect(result[0].subject).toBe("Shorter subject");
    const calledPrompt = fakeGenerate.mock.calls[0][0];
    expect(calledPrompt).toContain("make step 1 shorter");
    expect(calledPrompt).toContain("Old subject");
  });

  test("injects brand guidelines into systemInstruction when provided", async () => {
    fakeGenerate.mockResolvedValueOnce([
      { stepNumber: 1, delayDays: 0, subject: "Sub", body: "Body" }
    ]);
    const brandFields = { tone: "bold", campaignGoals: null, targetPersonas: null, proofPoints: null, bannedWords: null };
    await reviseSequence(currentSteps, "shorten step 1", brandFields, { generate: fakeGenerate });
    const [, calledOpts] = fakeGenerate.mock.calls[0];
    expect(calledOpts.systemInstruction).toContain("bold");
  });
});
