import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { main: page("index.html"), world: page("world.html") },
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
