import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { registerWorkers } from "./workers/index.js";
import { __setInstantlyImpl, realInstantly } from "./routes/emails.js";

__setInstantlyImpl(realInstantly);

const app = createApp();
app.listen(env.PORT, async () => {
  logger.info(`backend listening on :${env.PORT}`);
  await registerWorkers();
});
