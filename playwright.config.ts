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
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command:
      process.env.IBVS_E2E_PRODUCTION === "true"
        ? "node node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1"
        : "npm run dev",
    url: "http://localhost:3000/sign-in",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
