export default {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/env.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  transform: {},
  testTimeout: 30000,
  maxWorkers: 1,
  forceExit: true
};
