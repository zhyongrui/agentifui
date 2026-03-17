import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/evals/lib/*.test.ts"],
  },
});
