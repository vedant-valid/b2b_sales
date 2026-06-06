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

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
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
