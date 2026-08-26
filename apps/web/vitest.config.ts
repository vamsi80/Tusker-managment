import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// The root .env is the single source of truth for every app/package. Tests used
// to get these vars for free because the generated Prisma client auto-loaded
// .env from inside this app; now that Prisma lives in @tusker/db, load it here.
const { parsed: rootEnv } = dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
});

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        setupFiles: ["./src/tests/setup.ts"],
        env: rootEnv,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            // Workspace package ships raw TS; alias it so vite transforms the
            // source instead of externalising the symlink (which yields an
            // empty module and drops the re-exported Prisma enums).
            "@tusker/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
        },
    },
});
