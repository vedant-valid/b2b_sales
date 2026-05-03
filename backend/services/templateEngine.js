import { generateText } from "./gemini.js";

export function substituteVariables(template, lead) {
  return template
    .replace(/\{\{firstName\}\}/g, lead.firstName ?? "")
    .replace(/\{\{lastName\}\}/g, lead.lastName ?? "")
    .replace(/\{\{title\}\}/g, lead.title ?? "")
    .replace(/\{\{company\}\}/g, lead.company ?? "");
}

export async function renderTemplate(templateSubject, templateBody, lead, { generate = generateText } = {}) {
  let subject = substituteVariables(templateSubject, lead);
  let body = substituteVariables(templateBody, lead);

  const needsAi = subject.includes("{{aiPersonalization}}") || body.includes("{{aiPersonalization}}");
  if (needsAi) {
    const prompt = `Write a single short paragraph (1-2 sentences) personalising an outreach email for this person. Plain text only, no quotes, no greeting.

Name: ${lead.firstName} ${lead.lastName}
Title: ${lead.title ?? ""}
Company: ${lead.company ?? ""}`;
    const blurb = await generate(prompt);
    subject = subject.replace(/\{\{aiPersonalization\}\}/g, blurb);
    body = body.replace(/\{\{aiPersonalization\}\}/g, blurb);
  }

  return { subject, body };
}
