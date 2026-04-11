import { getBoss } from "../lib/pgboss.js";
import { logger } from "../lib/logger.js";
import * as fetchLeads from "./fetchLeads.js";
import * as generateEmail from "./generateEmail.js";

export async function registerWorkers() {
  const boss = await getBoss();
  await fetchLeads.register(boss);
  await generateEmail.register(boss);
  logger.info("workers registered");
  return boss;
}
