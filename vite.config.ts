import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

import fmt from "./oxfmt.config";
import lint from "./oxlint.config";

const config = defineConfig({
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
    tanstackStart(),
    viteReact(),
  ]),
});

export default config;
