import { defineConfig } from "@playwright/test";
import fs from "node:fs";

const PORT = 3123;
const localChromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: fs.existsSync(localChromium) && !process.env.PW_DEFAULT_BROWSER ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PGLITE_DIR: "memory://", // fresh in-memory database for every run
      AI_MOCK: "1",            // deterministic stand-in for the AI (tests only)
      ANTHROPIC_API_KEY: "",
      SIGNUP_CODE: "test-code",
      AUTH_SECRET: "test-secret-test-secret-test-secret",
      DATABASE_URL: "",
    },
  },
});
