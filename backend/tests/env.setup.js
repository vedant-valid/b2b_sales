import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Force the test database regardless of how Jest was invoked (npm test, npx jest, IDE runner, ...)
// — resetDb() in tests/setup.js deletes data, so tests must never be able to reach the dev/prod DB.
config({ path: resolve(here, "../.env.test"), override: true });

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL "${process.env.DATABASE_URL}" doesn't look like a test database. ` +
    `Tests call resetDb(), which deletes campaigns/leads/emails — set up backend/.env.test with an "_test" database.`
  );
}
