import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

let defaultClient = null;
function getDefault() {
  if (!defaultClient && env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    defaultClient = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
  }
  return defaultClient;
}

function makeClientWithInstruction(systemInstruction) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: env.GEMINI_MODEL, systemInstruction });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

function isRetriable(err) {
  return err.status === 429
    || err.status === 503
    || String(err.message).includes("429")
    || String(err.message).includes("503")
    || String(err.message).toLowerCase().includes("resource has been exhausted")
    || String(err.message).toLowerCase().includes("quota")
    || String(err.message).toLowerCase().includes("service unavailable")
    || String(err.message).toLowerCase().includes("overloaded");
}

export async function generateText(prompt, { client, systemInstruction, retries = 3, retryDelayMs = 2000 } = {}) {
  const c = client || (systemInstruction ? makeClientWithInstruction(systemInstruction) : getDefault());
  if (!c) throw new Error("GEMINI_API_KEY not configured");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await c.generateContent(prompt);
      return res.response.text();
    } catch (err) {
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
