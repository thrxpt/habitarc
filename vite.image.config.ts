import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { include: ["release-tests/**/*.test.ts"] },
});
