import { defineConfig } from "playwright/test";

const BASE_URL = "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
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
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-public-placeholder",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-placeholder",
      NEXTAUTH_SECRET: "local-e2e-placeholder-secret-32-bytes",
      FITBIT_CLIENT_ID: "local-fitbit-client",
      FITBIT_CLIENT_SECRET: "local-fitbit-secret",
    },
  },
});
