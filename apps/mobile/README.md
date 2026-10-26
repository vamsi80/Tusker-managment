# Tusker app

The native iOS/Android version of the Tusker website: React Native screens
(Expo SDK 54) built from the pages in `apps/web`. They call the same `/api/v1`
routes the website does. The app is outside the pnpm workspace, like `apps/mobile`.

## Run

```bash
pnpm app:install                 # from the repo root
cp apps/tusker-app/.env.example apps/tusker-app/.env
pnpm app                         # press "a" for the Android emulator, or scan the QR code with Expo Go
pnpm app:typecheck
```

`EXPO_PUBLIC_API_BASE` is the origin that serves `/api/v1` (the Vercel deployment).
To use a local API from the Android emulator, set it to `http://10.0.2.2:4000`.

If keys stop registering in Expo Go and a "New update available, downloading…"
banner stays at the bottom, the reload has stalled. Press `r` in Metro or reopen
the app.

## Layout

| Folder | What's in it |
|---|---|
| `src/api` | One module per API area (`tasks`, `projects`, `people`, `procurement`, `comms`, …). `client.ts` adds `/api/v1`, the Bearer token and error handling. |
| `src/providers` | `AuthProvider` (session token in SecureStore), `WorkspaceProvider` (the `/workspaces/:id/layout` payload, roles, `can()`, realtime), `PushNotifications`. |
| `src/navigation` | Auth stack → bottom tabs (Home, Tasks, Create, Inbox, More; `TabBar.tsx`) + stack screens for every other page. `types.ts` maps each route to its web page. |
| `src/screens/<area>` | One folder per web section: dashboard, calendar, team, tasks, messages, procurement, vendors, settings, projects, myspace, reports, notifications, profile, travis, auth. |
| `src/components/ui` | The shadcn kit as native components (Button, Input, Sheet, Select, Tabs, Dialog, …). |
| `src/components/<area>` | Pieces shared by an area's screens (task views, team tabs, report sheet, Travis messages, …). |
| `src/lib` | Formatting, query client + keys, realtime (Pusher over WebSocket), toast, and business rules ported from `packages/core` (task transitions, GST/PO maths, GSTIN). |
| `src/theme` | Tokens taken from `apps/web/src/app/globals.css`, light and dark. |

Cached query data is kept in AsyncStorage, so screens open instantly and
refresh in the background.

## Backend dependency

Settings (departments, permissions, activity log) and the Team settings tab use
the `/workspace-admin` routes in `apps/api/src/hono/routes/workspace-admin.ts`.
Deploy the API before shipping the app.

## Before the first build

1. `cd apps/tusker-app && npx eas-cli init` creates the EAS project and writes
   its id. Push notifications stay off until it exists. Expo Go can't receive
   remote push on Android, so the app skips push setup there.
2. Android push: in Firebase, add an Android app with package
   `com.thewhitetusker.tusker`. Put its `google-services.json` in this folder, and
   upload the FCM key in EAS (`eas credentials`).
3. Replace `assets/icon.png`, `assets/adaptive-icon.png` and `assets/splash-icon.png`
   if the artwork should change.

## Build

```bash
pnpm app:build                                                     # Android .aab for the Play Store
cd apps/tusker-app && npx eas-cli build -p android --profile apk   # installable .apk
cd apps/tusker-app && npx eas-cli build -p ios --profile production
```

## Known limits

- **Sign-in** is email/password and invitation sign-up only.
- **Avatar upload**: the profile screen edits name, nickname and phone. There's
  no upload route for profile photos yet.
- **To-do reordering** happens through a long-press menu (move up, down or to
  top), not drag and drop.
