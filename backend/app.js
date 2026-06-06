import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler.js";
import { env } from "./config/env.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import jobsRouter from "./routes/jobs.js";
import campaignsRouter from "./routes/campaigns.js";
import leadsRouter from "./routes/leads.js";
import emailsRouter from "./routes/emails.js";
import repliesRouter from "./routes/replies.js";
import webhooksRouter from "./routes/webhooks.js";
import exportRouter from "./routes/export.js";
import brandDocRouter from "./routes/brandDoc.js";
import senderAccountsRouter from "./routes/senderAccounts.js";
import sequenceRouter from "./routes/sequence.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/webhooks", webhooksRouter);  // before emailsRouter (which uses requireAuth on /api/*)
  app.use("/api/sender-accounts", senderAccountsRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/campaigns", sequenceRouter);
  app.use("/api/leads", leadsRouter);
  app.use("/api", emailsRouter);    // Catches /leads/:id/emails and /emails/:id/...
  app.use("/api/replies", repliesRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/brand-doc", brandDocRouter);

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  app.use(errorHandler);
  return app;
}
