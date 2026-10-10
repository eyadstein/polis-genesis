import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: page("index.html"), world: page("world.html") },
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
