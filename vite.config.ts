import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

import fmt from "./oxfmt.config";
import lint from "./oxlint.config";

const config = defineConfig({
  test: { include: ["tests/**/*.{test,spec}.{ts,tsx}"] },
  staged: {
    "*": "vp check --fix",
  },
  fmt,
  lint: {
    ...lint,
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [
    devtools(),
    tailwindcss(),
    // src/start.ts checks the canonical origin for every mutation.
    tanstackStart({ serverFns: { disableCsrfMiddlewareWarning: true } }),
    viteReact(),
  ]),
});

export default config;
