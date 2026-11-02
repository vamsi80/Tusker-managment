# Tusker for Windows

The full Tusker app for Windows. It runs **the website's own pages and components** (`apps/web`), bundled into the app, at the website's own paths. It doesn't load the website URL. Data comes from the same `/api/v1` as the website and the mobile app, live updates arrive over the same Pusher channels, and pages you've opened stay readable offline.

It sits outside the pnpm workspace, like `apps/desktop` (the widget) and `apps/mobile`, so a root `pnpm install` doesn't download Electron. Nothing in `apps/web` or `apps/mobile` is modified by this app; it only reads from them.

## Run

```bash
pnpm install                     # root: the app builds the website's code, which resolves its packages from there
pnpm app-desktop:install
cp apps/tusker-desktop/.env.example apps/tusker-desktop/.env   # add the Pusher key for live updates
pnpm app-desktop                 # Vite dev server + Electron
pnpm --dir apps/tusker-desktop typecheck
```

`TUSKER_API_BASE=http://localhost:4000 pnpm app-desktop` points it at a local API. The default is the Vercel deployment.

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| Window, token, network | `electron/main.cjs` | Every `/api/v1` request goes from here, with the Bearer token kept encrypted by Windows (`safeStorage`). The page never sees it. Also auto-updates. |
| Bridge | `electron/preload.cjs` | `window.tusker.request / session / signIn / signOut / notify / open / checkForUpdates`. Typed in `src/global.d.ts`. |
| Website routes | `src/App.tsx` | The website's page and layout files, at its paths (`/w/:workspaceId/...`). |
| Running pages | `src/next/server-component.tsx` | `clientPage()` lazy-loads `"use client"` pages. `serverPage()` runs server pages and layouts client-side (React 19 `use()`); `router.refresh()` re-runs them. |
| Next.js APIs | `src/next/navigation.ts`, `link.tsx`, `dynamic.tsx`, `image.tsx` | What the website's client code uses, on top of react-router and plain React. |
| Network for the website's code | `src/next/fetch-bridge.ts` | `fetch("/api/v1/...")` and Better Auth's `/api/auth/*` go through the main process. GET responses are saved in IndexedDB and served when offline; cleared on sign-out. |
| Server-only modules | `src/overrides/web/<path>`, `src/overrides/core/<path>` | A file here replaces `apps/web/src/<path>` or `packages/core/src/<path>` however it's imported (see `vite.config.ts`). Used for server actions, server data loaders, core services the pages call, and the 12 pages that query the database inline (copies with only those queries changed). |
| API for those | `apps/api/src/hono/routes/desktop.ts` | Runs the exact server functions and page queries the overrides need, each behind the same membership or permission gate as on the website. |
| Desktop extras | `src/App.tsx` (`DesktopExtras`), `src/screens/SettingsScreen.tsx` | Windows notifications while the app isn't focused, the offline banner, and the app's version and Check for updates in Settings (in place of the website's "Desktop apps" card). |

### When the website changes

Most changes need nothing here: the next build picks them up. Run this app's `typecheck` and `build` after changing website pages. If a page starts importing a new server-only module (`@/data/*`, `@/actions/*`, `@tusker/db`, a core server service), the build pulls server code into the bundle; add an override for it, backed by an API route.

## Release

Bump `version` in `package.json`, push to `main`, then `git tag app-vX.Y.Z && git push origin app-vX.Y.Z`. `.github/workflows/app-release.yml` builds and publishes to this repo's GitHub Releases. Optional: a `VITE_PUSHER_KEY` repo secret turns on live updates. If the release uses new routes in `apps/api`, let the push to `main` deploy them first.

The app shares this repo's releases with the widget (`desktop-v*`) without either picking up the other's updates:
- The app's update file is `app.yml` (`publish.channel`), never `latest.yml`, so the widget's updater can't see the app's installer.
- The app ignores `/releases/latest` and looks up its own newest `app-v*` release (`pointFeedAtNewestRelease` in `electron/main.cjs`).
- The workflow creates the app's release with `--latest=false`, so GitHub's "latest" mark (the only thing the widget's updater reads) stays on the widget's release.

The Settings page links to the newest `app-v*` release.

Local installer without publishing: `pnpm app-desktop:build`, output in `release/`.
