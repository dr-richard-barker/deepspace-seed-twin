import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Commit shown on the Stories end card: the model code the videos were rendered from.
function commit(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    const dirty = execSync("git status --porcelain -- app/src data stories").toString().trim() !== "";
    return dirty ? `${sha} + local changes` : sha;
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  plugins: [react()],
  root: "app",
  base: "./",
  define: { __COMMIT__: JSON.stringify(commit()) },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "app/index.html"),
        studio: resolve(__dirname, "app/studio.html"),
        stories: resolve(__dirname, "app/stories.html"),
      },
    },
  },
});
