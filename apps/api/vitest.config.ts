import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

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
            "@tusker/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
            "@tusker/core": path.resolve(__dirname, "../../packages/core/src"),
        },
    },
});
