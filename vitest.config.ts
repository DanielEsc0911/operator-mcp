import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    env: { OPERATOR_LANG: "en" },
    setupFiles: ["test/support/isolateHome.ts"],
  },
});
