import { jest } from "@jest/globals";
import { classifySentiment, draftFollowUp } from "../../services/replyHandler.js";

describe("replyHandler", () => {
  test("classifySentiment returns one of the enum values", async () => {
    const fake = jest.fn().mockResolvedValue({ sentiment: "INTERESTED" });
    const out = await classifySentiment("Yes, would love to chat next week", { generate: fake });
    expect(out).toBe("INTERESTED");
  });

  test("classifySentiment normalizes unknown to NEUTRAL", async () => {
    const fake = jest.fn().mockResolvedValue({ sentiment: "MAYBE" });
    const out = await classifySentiment("hmm", { generate: fake });
    expect(out).toBe("NEUTRAL");
  });

  test("draftFollowUp returns a string tailored to sentiment", async () => {
    const fake = jest.fn().mockResolvedValue({ followUp: "Great! Here are two times..." });
    const out = await draftFollowUp("Yes, would love to chat", { firstName: "Alice" }, "INTERESTED", { generate: fake });
    expect(out).toMatch(/times/);
  });

  test("includes brand doc in follow-up prompt when provided", async () => {
    let capturedPrompt = null;
    const fakeGen = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { followUp: "Got it, talk soon." };
    });
    const lead = { firstName: "Alice" };
    await draftFollowUp("Thanks!", lead, "INTERESTED", { generate: fakeGen, brandDoc: "Never use em-dashes." });
    expect(capturedPrompt).toContain("Never use em-dashes.");
  });
});
