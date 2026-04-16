import { jest } from "@jest/globals";
import { generateDraft } from "../../services/emailGen.js";

describe("emailGen", () => {
  test("returns subject and body", async () => {
    const fake = jest.fn().mockResolvedValue({
      subject: "Partnering on NST talent for Acme",
      body: "Hi Alice,\n\nNoticed Acme just raised a Series C..."
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "Head of Eng", company: "Acme" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST students build production systems" };
    const draft = await generateDraft(lead, profile, { generate: fake });
    expect(draft.subject).toMatch(/Acme/);
    expect(draft.body).toContain("Alice");
    expect(fake).toHaveBeenCalled();
  });

  test("passes systemInstruction when brandDoc is provided", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (prompt, opts) => {
      capturedOpts = opts;
      return { subject: "Test", body: "Hi" };
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme", department: "Eng" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST builds" };
    await generateDraft(lead, profile, { generate: fake, brandDoc: "Never say talented." });
    expect(capturedOpts).toHaveProperty("systemInstruction");
    expect(capturedOpts.systemInstruction).toContain("Never say talented.");
  });
});
