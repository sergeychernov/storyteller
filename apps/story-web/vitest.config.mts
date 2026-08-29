import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.browser.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
