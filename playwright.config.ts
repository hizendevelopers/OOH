import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 30000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    reducedMotion: "reduce",
  },
  webServer: {
    command:
      process.env.IBVS_E2E_PRODUCTION === "true" ? "npm start" : "npm run dev",
    url: "http://localhost:3000/sign-in",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
