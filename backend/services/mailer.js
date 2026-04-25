import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { HttpError } from "../middleware/errorHandler.js";

function createTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_ADDRESS,
      pass: env.GMAIL_APP_PASSWORD
    }
  });
}

export async function sendFollowUp({ to, subject, body }) {
  if (!env.GMAIL_ADDRESS || !env.GMAIL_APP_PASSWORD) {
    throw new Error("Gmail credentials not configured (GMAIL_ADDRESS / GMAIL_APP_PASSWORD)");
  }
  const transporter = createTransport();
  let info;
  try {
    info = await transporter.sendMail({
      from: `${env.GMAIL_FROM_NAME || "Outreach"} <${env.GMAIL_ADDRESS}>`,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>")
    });
  } catch (err) {
    if (err.code === "EAUTH") {
      throw new HttpError(502, "gmail_auth_failed", "Gmail authentication failed — regenerate the App Password at myaccount.google.com/apppasswords and update GMAIL_APP_PASSWORD in backend/.env");
    }
    throw new HttpError(502, "mailer_error", err.message);
  }
  logger.info(`mailer: sent follow-up to ${to} — messageId=${info.messageId}`);
  return info;
}
