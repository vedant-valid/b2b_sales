import { jest } from "@jest/globals";
import { generateJson } from "../../services/gemini.js";

describe("gemini.generateJson", () => {
  test("parses JSON from response text", async () => {
    const fakeClient = {
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => '```json\n{"foo":"bar"}\n```' }
      })
    };
    const result = await generateJson("prompt", { client: fakeClient });
    expect(result).toEqual({ foo: "bar" });
  });

  test("throws on invalid JSON", async () => {
    const fakeClient = {
      generateContent: jest.fn().mockResolvedValue({ response: { text: () => "not json" } })
    };
    await expect(generateJson("prompt", { client: fakeClient })).rejects.toThrow();
  });
});
