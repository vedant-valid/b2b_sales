import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { generateJson } from "./gemini.js";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXTRACT_PROMPT = `You are a brand document parser. Extract structured brand information from the provided document text.

Return JSON only with this exact shape:
{
  "tone": string or null,
  "campaignGoals": string or null,
  "targetPersonas": string or null,
  "proofPoints": string or null,
  "bannedWords": string or null
}

Rules:
- tone: writing style/voice guidance (e.g. "Professional, concise, no jargon")
- campaignGoals: who to target and what outcome to achieve
- targetPersonas: description of ideal leads/buyers
- proofPoints: concrete results or case studies, one per line
- bannedWords: words or phrases to avoid, comma-separated
- Return null for any field you cannot confidently extract from the text
- Do NOT fabricate information not present in the document`;

export async function extractTextFromBuffer(buffer, mimetype) {
  if (mimetype === PDF_MIME) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }
  if (mimetype === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error("unsupported_file_type");
}

export async function extractBrandFields(text, { generate = generateJson } = {}) {
  const prompt = `${EXTRACT_PROMPT}\n\nDocument:\n${text}\n\nJSON:`;
  return generate(prompt);
}
