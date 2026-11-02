import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = normalizePath(path.resolve(here, "../.."));
const web = `${repo}/apps/web/src`;
const mobileApi = `${repo}/apps/mobile/src/api`;

/**
 * Reuse apps/mobile/src/api/* (every endpoint, typed) unchanged: those modules
 * import only "./client", so when one of them asks for it, hand over this app's
 * client instead. It has the same exports, backed by the main process. Read-only:
 * nothing in apps/mobile changes.
 */
const mobileApiClient: Plugin = {
  name: "tusker:mobile-api-client",
  enforce: "pre",
  resolveId(source, importer) {
    if (source === "./client" && importer && normalizePath(path.dirname(importer)) === mobileApi) {
      return normalizePath(path.resolve(here, "src/api/client.ts"));
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
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' wss://*.pusher.com https://*.pusher.com https://*.pusherapp.com",
      },
    },
  ],
};

export default defineConfig({
  base: "./", // loaded from file:// when packaged
  plugins: [mobileApiClient, contentSecurityPolicy, react(), tailwindcss()],
  resolve: {
    alias: [
      // The website's UI kit and helpers, used as-is (read-only).
      { find: /^@\/components\/ui\//, replacement: `${web}/components/ui/` },
      { find: /^@\/lib\/utils$/, replacement: `${web}/lib/utils.ts` },
      { find: /^@\/hooks\//, replacement: `${web}/hooks/` },
      { find: /^@tusker\/core\//, replacement: `${repo}/packages/core/src/` },
      { find: /^@mobile\/api\//, replacement: `${mobileApi}/` },
      { find: /^~\//, replacement: `${normalizePath(path.resolve(here, "src"))}/` },
    ],
    // The web files resolve their packages from apps/web/node_modules; one React for everything.
    dedupe: ["react", "react-dom"],
  },
  server: { fs: { allow: [repo] } },
  build: { outDir: "dist", emptyOutDir: true },
});
