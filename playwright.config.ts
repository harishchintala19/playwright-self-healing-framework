import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: 2, 
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    headless: false,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
  ],
});
