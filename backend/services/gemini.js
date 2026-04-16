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

export async function generateText(prompt, { client, systemInstruction } = {}) {
  const c = client || (systemInstruction ? makeClientWithInstruction(systemInstruction) : getDefault());
  if (!c) throw new Error("GEMINI_API_KEY not configured");
  const res = await c.generateContent(prompt);
  return res.response.text();
}

export async function generateJson(prompt, opts = {}) {
  const text = await generateText(prompt, opts);
  return extractJson(text);
}
