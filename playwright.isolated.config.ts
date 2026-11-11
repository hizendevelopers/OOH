import { defineConfig, devices } from "@playwright/test";
// Isolated run: local database only, separate port. Used for demo browser checks, not production or the hosted test DB.
export default defineConfig({
  testDir: "tests",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 30000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
    reducedMotion: "reduce",
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  webServer: {
    command: "npx next dev apps/web --hostname 127.0.0.1 --port 3100",
    cwd: ".",
    env: {
      DATABASE_URL: "",
      IBVS_LOCAL_DB: process.env.IBVS_LOCAL_DB ?? "",
      IBVS_REQUIRE_SIGN_IN: "true",
      BETTER_AUTH_URL: "http://localhost:3100",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
    },
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 240000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "android-chrome", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
});
