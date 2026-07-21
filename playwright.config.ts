import { randomUUID } from "node:crypto";

import { defineConfig } from "playwright/test";

const BASE_URL = "http://localhost:3000";
const LOCAL_ONLY_TOKEN = randomUUID();
const REUSE_EXISTING_SERVER = process.env.PLAYWRIGHT_REUSE_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3000",
    url: BASE_URL,
    reuseExistingServer: REUSE_EXISTING_SERVER,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ONLY_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_ONLY_TOKEN,
      NEXTAUTH_SECRET: LOCAL_ONLY_TOKEN,
      FITBIT_CLIENT_ID: "local-fitbit-client",
      FITBIT_CLIENT_SECRET: LOCAL_ONLY_TOKEN,
    },
  },
});
