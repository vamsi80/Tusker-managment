Type-only stand-ins for the React Native packages that `apps/mobile/src/api/client.ts`
imports. `tsc` reaches that file through the reused mobile API modules, but Vite swaps
it for `src/api/client.ts`, so these packages never ship in this app. `tsconfig.json`
maps the package names here (`paths`), so the type check behaves the same whether or
not `apps/mobile/node_modules` is installed (CI doesn't install it).
