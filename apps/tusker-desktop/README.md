# Tusker for Windows

The full Tusker app for Windows. It has its own screens bundled in the app (it does not load the website). It talks to the same `/api/v1` as the website and the mobile app, and stays in sync with them through the same Pusher channels. Data you've opened stays readable offline; changes need a connection.

It sits outside the pnpm workspace, like `apps/desktop` (the widget) and `apps/mobile`, so a root `pnpm install` doesn't download Electron.

## Run

```bash
pnpm install                     # root: the app reuses the website's UI kit and @tusker/core from source
pnpm app-desktop:install
cp apps/tusker-desktop/.env.example apps/tusker-desktop/.env   # add the Pusher key for live updates
pnpm app-desktop                 # Vite dev server + Electron
pnpm --dir apps/tusker-desktop typecheck
```

`TUSKER_API_BASE=http://localhost:4000 pnpm app-desktop` points it at a local API. The default is the Vercel deployment.

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| Window, token, network | `electron/main.cjs` | Every `/api/v1` request goes from here, with the Bearer token kept encrypted by Windows (`safeStorage`). The page never sees it. Ported from the widget. |
| Bridge | `electron/preload.cjs` | `window.tusker.request / session / signIn / signOut / notify / open`. Typed in `src/global.d.ts`. |
| Endpoints | `apps/mobile/src/api/*`, **read-only** | Reused as-is. `vite.config.ts` swaps their `./client` import for `src/api/client.ts`, which has the same exports but goes through the bridge. |
| UI kit, theme, fonts | `apps/web/src/components/ui`, `globals.css`, `assets/fonts`, **read-only** | Imported through aliases, so the app looks like the website. |
| Cache | `src/lib/query.ts` | TanStack Query persisted to IndexedDB for 7 days. Cleared on sign-out. |
| Live sync | `src/lib/realtime.ts`, `src/providers/WorkspaceProvider.tsx` | Pusher `team-{workspaceId}` and `user-{userId}`. Events refetch the matching queries; new notifications also show a Windows notification. |
| Screens | `src/screens` | Dashboard, Tasks, Notifications so far. New screens follow the web page and use `@mobile/api/*`. |

Nothing in `apps/web` or `apps/mobile` is modified by this app; it only reads from them. If you change a mobile API module or a web UI component, run this app's `typecheck` too.

## Release

1. One-time setup: create the public repo `vamsi80/tusker-desktop-releases`, then add repo secrets `DESKTOP_RELEASES_TOKEN` (contents: write on that repo) and `VITE_PUSHER_KEY`.
2. Bump `version` in `package.json`, then `git tag app-vX.Y.Z && git push origin app-vX.Y.Z`. `.github/workflows/app-release.yml` builds and publishes.

Releases need their own repo: `electron-updater` reads a repo's `/releases/latest` with no tag filter, so sharing the widget's repo would let one app install the other as an "update". The Settings page links to the newest `app-v*` release in that repo.

Local installer without publishing: `pnpm app-desktop:build`, output in `release/`.
