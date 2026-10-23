import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The repo keeps one .env at its root. Vite only exposes VITE_* variables to the bundle,
  // so backend secrets in the same file never reach the browser.
  envDir: "..",
  server: { port: 5173 },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
