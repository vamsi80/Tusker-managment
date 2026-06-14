// Dev wrapper for `wrangler dev`.
//
// Wrangler resolves the Hyperdrive binding BEFORE it loads `.dev.vars`, so the local
// Postgres connection string must already be a real process env var. This wrapper reads
// it from the (gitignored) `.dev.vars` and injects it, then starts wrangler — so
// `pnpm run dev` / `pnpm run api:dev` "just works" with no DB password in committed config.
const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readDevVars() {
    try {
        return readFileSync(path.join(__dirname, ".dev.vars"), "utf8");
    } catch {
        return "";
    }
}

const vars = readDevVars();
const pick = (name) => (vars.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m")) || [])[1];

// Prefer an explicit local Hyperdrive string, else fall back to the app DB URLs.
const conn =
    pick("CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE") ||
    pick("DATABASE_URL") ||
    pick("DIRECT_URL");

if (!conn) {
    console.error(
        "[dev] No Postgres URL found in apps/api/.dev.vars " +
        "(CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE / DATABASE_URL / DIRECT_URL)."
    );
    process.exit(1);
}

const env = { ...process.env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: conn };
const args = ["wrangler", "dev", ...process.argv.slice(2)];

const child = spawn("npx", args, { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
