import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  reactStrictMode: true,
  // Only set outputFileTracingRoot in local monorepo dev; Vercel breaks with parent-dir tracing
  ...(process.env.VERCEL ? {} : { outputFileTracingRoot: path.join(__dirname, "..") }),
  env: {
    NEXT_PUBLIC_DEV_MODE: process.env.NEXT_PUBLIC_DEV_MODE ?? "false",
  },
};
