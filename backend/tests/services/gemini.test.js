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

  test("parses JSON containing literal newlines inside string values", async () => {
    const content = '{\n  "subject": "Hi",\n  "body": "Line one.\nLine two.\n- Sign off"\n}';
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content } }]
          })
        }
      }
    };
    __setClientForTest(fakeClient);
    const result = await generateJson("prompt");
    expect(result.subject).toBe("Hi");
    expect(result.body).toBe("Line one.\nLine two.\n- Sign off");
  });

  test("parses JSON containing a non-newline/tab/CR C0 control character inside a string value", async () => {
    // U+0001 (start-of-heading) embedded raw inside a string value, as
    // Groq sometimes returns. Built via fromCharCode rather than a literal
    // control char in source to keep this file editor/encoding-safe.
    const content = `{"body": "Weird${String.fromCharCode(1)}char"}`;
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content } }]
          })
        }
      }
    };
    __setClientForTest(fakeClient);
    const result = await generateJson("prompt");
    expect(result.body).toBe(`Weird${String.fromCharCode(1)}char`);
    expect(result.body).toContain(String.fromCharCode(1));
  });

  test("parses JSON containing an escaped backslash immediately followed by a raw newline", async () => {
    // Raw model output: a literal backslash, then a real newline. This is
    // "a literal backslash followed by a paragraph break", NOT a `\n` escape
    // sequence — the sanitizer must not treat the newline as already-escaped.
    const content = '{"body": "Path C:\\\\\nNext line"}';
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content } }]
          })
        }
      }
    };
    __setClientForTest(fakeClient);
    const result = await generateJson("prompt");
    expect(result.body).toBe("Path C:\\\nNext line");
    expect(result.body).toContain("\\");
    expect(result.body).toContain("\n");
  });

  test("does not double-escape an already-escaped \\n sequence", async () => {
    // Raw model output contains the two source characters `\` then `n`,
    // representing a valid JSON `\n` escape — must pass through unchanged.
    const content = '{"body": "Line one\\nLine two"}';
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content } }]
          })
        }
      }
    };
    __setClientForTest(fakeClient);
    const result = await generateJson("prompt");
    expect(result.body).toBe("Line one\nLine two");
  });
});
