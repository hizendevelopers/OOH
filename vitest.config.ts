import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    // Same "@/" alias as apps/web/tsconfig.json, so route modules load under test.
    alias: [{ find: /^@\//, replacement: path.resolve(__dirname, "apps/web/src") + "/" }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
