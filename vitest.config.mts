import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/", replacement: `${path.resolve(root, ".")}/` },
      {
        // `server-only` deliberately throws unless it is imported from a React
        // Server Component graph. Vitest has no RSC graph, so tests alias
        // `server-only` to an empty stub. Only affects tests — the app keeps
        // the real module, which still guards the real server/client split.
        find: /^server-only$/,
        replacement: path.resolve(root, "test/stubs/server-only.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
