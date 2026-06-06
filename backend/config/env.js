import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  LUSHA_API_KEY: z.string().optional(),
  INSTANTLY_API_KEY: z.string().optional(),
  INSTANTLY_WEBHOOK_SECRET: z.string().optional(),
  INSTANTLY_SENDING_ACCOUNTS: z.string().optional(),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  DEV_MODE: z.string().optional(),
  DEV_EMAIL: z.string().optional(),
  GMAIL_ADDRESS: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  GMAIL_FROM_NAME: z.string().optional()
});

export const env = schema.parse(process.env);
