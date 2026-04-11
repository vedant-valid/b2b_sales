import { getBoss } from "../lib/pgboss.js";
import { logger } from "../lib/logger.js";

export async function registerWorkers() {
  const boss = await getBoss();
  logger.info("workers registered (none yet)");
  return boss;
}
