import Groq from "groq-sdk";
import { env } from "../config/env.js";

let client = null;
function getClient() {
  if (!client) {
    if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
    client = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return client;
}

export function __setClientForTest(c) { client = c; }

// Groq sometimes returns JSON where multi-paragraph string values contain
// literal newline/carriage-return/tab characters instead of the escaped
// `\n`/`\r`/`\t` sequences required by the JSON spec. JSON.parse rejects
// raw control characters inside string literals, so walk the text and
// escape them when they appear inside a string. Outside of strings (e.g.
// whitespace between tokens) the text is left untouched, so this is a
// no-op for already well-formed JSON.
function sanitizeJsonControlChars(text) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString && escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (inString && char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (inString && char === '"') {
      result += char;
      inString = false;
      continue;
    }

    // Any raw C0 control character (U+0000-U+001F) inside a string is
    // illegal in JSON. Prefer the standard two-char escapes for the three
    // common ones (newline/carriage-return/tab), and fall back to a
    // generic `\u00XX` escape for the rest (e.g. U+0001, U+000B, U+001F).
    if (inString && char.charCodeAt(0) < 0x20) {
      if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        result += "\\r";
      } else if (char === "\t") {
        result += "\\t";
      } else {
        const hex = char.charCodeAt(0).toString(16).padStart(2, "0");
        result += `\\u00${hex}`;
      }
      continue;
    }

    if (inString) {
      result += char;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = true;
      continue;
    }

    result += char;
  }

  return result;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(sanitizeJsonControlChars(raw.trim()));
}

function isRetriable(err) {
  return err.status === 503
    || String(err.message).toLowerCase().includes("service unavailable")
    || String(err.message).toLowerCase().includes("overloaded");
}

function isRateLimit(err) {
  return err.status === 429
    || String(err.message).includes("429")
    || String(err.message).toLowerCase().includes("rate limit")
    || String(err.message).toLowerCase().includes("quota");
}

export async function generateText(prompt, { systemInstruction, retries = 3, retryDelayMs = 2000 } = {}) {
  const c = getClient();
  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: prompt });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await c.chat.completions.create({
        model: env.GROQ_MODEL,
        messages,
        temperature: 0.7,
      });
      return res.choices[0].message.content;
    } catch (err) {
      if (isRateLimit(err)) throw err;
      if (isRetriable(err) && attempt < retries) {
        await new Promise(r => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
}

export async function generateJson(prompt, opts = {}) {
  const text = await generateText(prompt, opts);
  return extractJson(text);
}
