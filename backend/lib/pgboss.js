import PgBoss from "pg-boss";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

let instance = null;

export async function getBoss() {
  if (instance) return instance;
  instance = new PgBoss({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  instance.on("error", (e) => logger.error("pgboss", e));
  await instance.start();
  return instance;
}

export async function stopBoss() {
  if (instance) { await instance.stop({ graceful: true }); instance = null; }
}
