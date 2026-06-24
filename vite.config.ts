import { defineConfig } from "vite";

declare const process: {
  env: Record<string, string | undefined>;
};

const phaseName = "Hashlake Phase 43";
const buildCommit = process.env.GITHUB_SHA?.slice(0, 7) ?? "local-dev";
const buildTimestamp = new Date().toISOString();

export default defineConfig({
  base: "/HashLakeCodex/",
  define: {
    __HASHLAKE_PHASE__: JSON.stringify(phaseName),
    __HASHLAKE_COMMIT__: JSON.stringify(buildCommit),
    __HASHLAKE_BUILD_TIME__: JSON.stringify(buildTimestamp),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
