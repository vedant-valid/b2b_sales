import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { registerWorkers } from "./workers/index.js";
import { __setInstantlyImpl, realInstantly } from "./routes/emails.js";
import { prisma } from "./lib/prisma.js";
import bcrypt from "bcryptjs";

__setInstantlyImpl(realInstantly);

async function ensureSeedUsers() {
  const existing = await prisma.user.findUnique({ where: { email: "vedantmadne555@gmail.com" } });
  if (existing) return;
  const hash = await bcrypt.hash(process.env.SEED_PASSWORD || "Admin1234!", 10);
  await prisma.user.createMany({
    data: [
      { email: "vedantmadne555@gmail.com", name: "Vedant Madne", role: "ADMIN",   password: hash },
      { email: "manager@reachout.dev",     name: "Manager Demo",  role: "MANAGER", password: hash },
    ]
  });
  logger.info("seed: created default admin and manager accounts");
}

const app = createApp();
const server = app.listen(env.PORT, async () => {
  logger.info(`backend listening on :${env.PORT}`);
  try {
    await ensureSeedUsers();
  } catch (err) {
    logger.warn({ err }, "seed: could not reach DB on startup — will retry on first request");
  }
  try {
    await registerWorkers();
  } catch (err) {
    logger.warn({ err }, "workers: failed to register — background jobs unavailable");
  }
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
