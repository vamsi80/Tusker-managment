// One command for development: Vite's dev server, then Electron pointed at it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];

const electron = createRequire(import.meta.url)("electron"); // path to the binary
// Editors' extension hosts (VS Code) set ELECTRON_RUN_AS_NODE, which would start Electron as plain Node.
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
const child = spawn(electron, ["."], { stdio: "inherit", env: { ...env, VITE_DEV_SERVER_URL: url } });
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
