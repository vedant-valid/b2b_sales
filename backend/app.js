import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  app.use(errorHandler);
  return app;
}
