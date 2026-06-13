import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.js"],
    // Node 20.12+/22+ ship an experimental global `localStorage`/`sessionStorage`
    // that shadows jsdom's working implementation in the test environment
    // (vitest's populateGlobal only overrides keys not already on `global`).
    // Disable Node's stub so jsdom's Storage implementation is used instead.
    poolOptions: {
      forks: {
        execArgv: ["--no-experimental-webstorage"]
      }
    }
  }
});
