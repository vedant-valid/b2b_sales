import { jest } from "@jest/globals";
import { generateJson, __setClientForTest } from "../../services/gemini.js";

describe("gemini.generateJson (Groq backend)", () => {
  afterEach(() => __setClientForTest(null));

  test("parses JSON from fenced response", async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: '```json\n{"foo":"bar"}\n```' } }]
          })
        }
      }
    };
    __setClientForTest(fakeClient);
    const result = await generateJson("prompt");
    expect(result).toEqual({ foo: "bar" });
  });

  test("throws on invalid JSON", async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: "not json at all" } }]
          })
        }
      }
    };
    __setClientForTest(fakeClient);
    await expect(generateJson("prompt")).rejects.toThrow();
  });
});
