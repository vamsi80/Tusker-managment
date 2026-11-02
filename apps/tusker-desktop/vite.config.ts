import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = normalizePath(path.resolve(here, "../.."));
const src = normalizePath(path.resolve(here, "src"));
const web = `${repo}/apps/web/src`;
const core = `${repo}/packages/core/src`;
const mobileApi = `${repo}/apps/mobile/src/api`;

/**
 * The app runs the website's own pages and components (apps/web, read-only).
 * A few modules can't run in a window: server actions, server-only data
 * loaders, and core files that build server clients at import time. A file at
 * src/overrides/web/<path> or src/overrides/core/<path> replaces
 * apps/web/src/<path> or packages/core/src/<path>, however it is imported
 * (alias or relative path). Nothing in apps/web or packages/core changes.
 */
const overrides: Plugin = {
    name: "tusker:overrides",
    enforce: "pre",
    async resolveId(source, importer, options) {
        if (!importer || source.startsWith("\0")) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (!resolved) return null;
        const file = normalizePath(resolved.id.split("?")[0]);
        for (const [root, name] of [[web, "web"], [core, "core"]] as const) {
            if (!file.startsWith(`${root}/`)) continue;
            const rel = file.slice(root.length + 1).replace(/\.(tsx?|jsx?)$/, "");
            for (const ext of [".ts", ".tsx"]) {
                const candidate = `${src}/overrides/${name}/${rel}${ext}`;
                if (fs.existsSync(candidate)) return candidate;
            }
        }
        return null;
    },
};

/**
 * apps/mobile/src/api/* (still used by the sign-in flow) imports "./client";
 * hand those this app's client, backed by the main process.
 */
const mobileApiClient: Plugin = {
    name: "tusker:mobile-api-client",
    enforce: "pre",
    resolveId(source, importer) {
        if (source === "./client" && importer && normalizePath(path.dirname(importer)) === mobileApi) {
            return `${src}/api/client.ts`;
        }
    },
};

// Built pages only: the dev server's React Refresh preamble is an inline script.
const contentSecurityPolicy: Plugin = {
    name: "tusker:csp",
    apply: "build",
    transformIndexHtml: () => [
        {
            tag: "meta",
            injectTo: "head-prepend",
            attrs: {
                "http-equiv": "Content-Security-Policy",
                content:
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss://*.pusher.com",
            },
        },
    ],
};

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, here, "VITE_"), ...process.env };
  return {
    base: "./", // loaded from file:// when packaged
    plugins: [overrides, mobileApiClient, contentSecurityPolicy, react(), tailwindcss()],
    // The website's code reads process.env.NEXT_PUBLIC_*; only public values exist here.
    define: {
        "process.env": JSON.stringify({
            NODE_ENV: mode === "production" ? "production" : "development",
            NEXT_PUBLIC_APP_URL: "https://tusker-managment.vercel.app",
            NEXT_PUBLIC_PUSHER_KEY: env.VITE_PUSHER_KEY || "0203f5f8bc12eb473338",
            NEXT_PUBLIC_PUSHER_CLUSTER: env.VITE_PUSHER_CLUSTER ?? "ap2",
        }),
    },
    resolve: {
        alias: [
            // Next.js APIs the website's client code uses, mapped to react-router and plain React.
            { find: /^next\/navigation$/, replacement: `${src}/next/navigation.ts` },
            { find: /^next\/link$/, replacement: `${src}/next/link.tsx` },
            { find: /^next\/dynamic$/, replacement: `${src}/next/dynamic.tsx` },
            { find: /^next\/image$/, replacement: `${src}/next/image.tsx` },
            // Workspace packages, from source (this app is outside the pnpm workspace).
            { find: /^@tusker\/api-client$/, replacement: `${repo}/packages/api-client/src/index.ts` },
            { find: /^@tusker\/api-client\//, replacement: `${repo}/packages/api-client/src/` },
            { find: /^@tusker\/core$/, replacement: `${core}/index.ts` },
            { find: /^@tusker\/core\//, replacement: `${core}/` },
            { find: /^@mobile\/api\//, replacement: `${mobileApi}/` },
            // This app's own code, then the website's (its "@/" alias).
            { find: /^~\//, replacement: `${src}/` },
            { find: /^@\//, replacement: `${web}/` },
        ],
        // The web files resolve their packages from apps/web/node_modules. These must be
        // one copy for the website's components and this app's providers alike (React
        // itself; the theme and toast providers from the website's root layout).
        dedupe: ["react", "react-dom", "next-themes", "sonner"],
    },
    // A string here stops Vite reading each file's nearest tsconfig.json (apps/mobile's
    // extends expo/tsconfig.base, only resolvable where the mobile app is installed).
    esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "ES2022", useDefineForClassFields: true, jsx: "react-jsx" } }) },
    server: { fs: { allow: [repo] } },
    build: { outDir: "dist", emptyOutDir: true },
  };
});
