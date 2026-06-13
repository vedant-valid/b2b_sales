import { jest } from "@jest/globals";
import { generateDraft, generateTemplateEmail, DEFAULT_SENDER_NAME } from "../../services/emailGen.js";

describe("generateDraft", () => {
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

  test("passes systemInstruction when brandFields has content", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (prompt, opts) => {
      capturedOpts = opts;
      return { subject: "Test", body: "Hi" };
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme", department: "Eng" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST builds" };
    await generateDraft(lead, profile, { generate: fake, brandFields: { tone: "Direct", bannedWords: "synergy" } });
    expect(capturedOpts).toHaveProperty("systemInstruction");
    expect(capturedOpts.systemInstruction).toContain("Direct");
    expect(capturedOpts.systemInstruction).toContain("synergy");
  });

  test("passes no systemInstruction when brandFields is null", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (prompt, opts) => {
      capturedOpts = opts;
      return { subject: "Test", body: "Hi" };
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST builds" };
    await generateDraft(lead, profile, { generate: fake, brandFields: null });
    expect(capturedOpts).toEqual({ responseFormat: { type: "json_object" } });
  });

  test("requests JSON-object response format from Groq", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (prompt, opts) => {
      capturedOpts = opts;
      return { subject: "Test", body: "Hi" };
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST builds" };
    await generateDraft(lead, profile, { generate: fake });
    expect(capturedOpts.responseFormat).toEqual({ type: "json_object" });
  });

  test("prompt includes humanized structure: sign-off, opt-out, and USPs", async () => {
    let capturedPrompt = null;
    const fake = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { subject: "Test", body: "Hi" };
    });
    const lead = { firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme" };
    const profile = { senderName: "Bob", senderCompany: "NST", valueProp: "NST builds" };
    await generateDraft(lead, profile, { generate: fake });
    expect(capturedPrompt).toContain("Sign-off");
    expect(capturedPrompt).toContain("unsubscribe");
    expect(capturedPrompt).toContain("USPs");
  });
});

describe("generateTemplateEmail", () => {
  test("returns subject and body using rawGoal", async () => {
    const fake = jest.fn().mockResolvedValue({
      subject: "Scale hiring at {{company}}",
      body: "Hi {{firstName}},\n\nAs {{title}} at {{company}}, you know hiring is hard..."
    });
    const result = await generateTemplateEmail("hire engineers fast", null, { generate: fake });
    expect(result.subject).toBeDefined();
    expect(result.body).toBeDefined();
    expect(fake).toHaveBeenCalledTimes(1);
    const [prompt] = fake.mock.calls[0];
    expect(prompt).toContain("hire engineers fast");
    expect(prompt).toContain("{{firstName}}");
    expect(prompt).toContain("{{company}}");
  });

  test("passes systemInstruction when brandFields has content", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (_prompt, opts) => {
      capturedOpts = opts;
      return { subject: "S", body: "B" };
    });
    await generateTemplateEmail("find CTOs", { tone: "Concise", bannedWords: "innovative" }, { generate: fake });
    expect(capturedOpts).toHaveProperty("systemInstruction");
    expect(capturedOpts.systemInstruction).toContain("Concise");
    expect(capturedOpts.systemInstruction).toContain("innovative");
  });

  test("prompt includes humanized structure: sign-off with DEFAULT_SENDER_NAME, opt-out, and USPs", async () => {
    let capturedPrompt = null;
    const fake = jest.fn().mockImplementation(async (prompt) => {
      capturedPrompt = prompt;
      return { subject: "S", body: "B" };
    });
    await generateTemplateEmail("hire engineers fast", null, { generate: fake });
    expect(capturedPrompt).toContain("Sign-off");
    expect(capturedPrompt).toContain("unsubscribe");
    expect(capturedPrompt).toContain("USPs");
    expect(capturedPrompt).toContain(DEFAULT_SENDER_NAME);
  });

  test("requests JSON-object response format from Groq", async () => {
    let capturedOpts = null;
    const fake = jest.fn().mockImplementation(async (_prompt, opts) => {
      capturedOpts = opts;
      return { subject: "S", body: "B" };
    });
    await generateTemplateEmail("hire engineers fast", null, { generate: fake });
    expect(capturedOpts.responseFormat).toEqual({ type: "json_object" });
  });
});
