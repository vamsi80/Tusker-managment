<div align="center">

<img src="apps/web/public/logo-white-tusker.png" alt="Tusker" width="120" />

# Tusker Management

**A construction & project operations platform — work management, procurement, attendance and an in-app AI agent — shipped as a web app, a standalone API and a native mobile client from one monorepo.**

[![CI](https://github.com/vamsi80/Tusker-managment/actions/workflows/ci.yml/badge.svg)](https://github.com/vamsi80/Tusker-managment/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)](https://hono.dev)
[![Expo](https://img.shields.io/badge/Expo-React%20Native-000020?logo=expo&logoColor=white)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-49%20models-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

[Live demo](https://YOUR-DEPLOYMENT-URL) · [Architecture](#architecture) · [Permissions model](#permissions-three-layers-that-all-have-to-agree) · [Running it](#running-it)

</div>

---

> Replace `YOUR-DEPLOYMENT-URL` and add the three screenshots referenced below before sharing this. A README that links a dead demo reads worse than one with no demo at all.

<div align="center">
  <img src="docs/screenshot-gantt.png" alt="Project Gantt view" width="850" />
  <br /><br />
  <img src="docs/screenshot-procurement.png" alt="Procurement indent workflow" width="420" />
  <img src="docs/screenshot-mobile.png" alt="Mobile app" width="200" />
</div>

---

## Contents

- [What this is](#what-this-is)
- [Feature areas](#feature-areas)
- [Architecture](#architecture)
- [Permissions](#permissions-three-layers-that-all-have-to-agree)
- [Travis, the in-app agent](#travis-the-in-app-agent)
- [Tech stack](#tech-stack)
- [Running it](#running-it)
- [Testing and CI](#testing-and-ci)
- [Repository layout](#repository-layout)
- [Design decisions worth arguing about](#design-decisions-worth-arguing-about)
- [Known gaps and roadmap](#known-gaps-and-roadmap)
- [License](#license)

---

## What this is

Most "project management clones" stop at boards and tasks. This one carries the operational workload of a construction business end to end:

- A **workspace** holds projects, departments, shift schedules and a member roster with seven roles.
- **Projects** run through list, kanban and Gantt views, with subtask dependencies, tags, comments, attachments and an activity feed.
- **Procurement** takes a material requirement from indent → RFQ → vendor quotes → comparison matrix → purchase order, with GSTIN verification and an approval chain in between.
- **Attendance and leave** are tracked per shift, including a face-recognition kiosk device flow, with leave projections feeding the project dashboards.
- **Travis** is a workspace-scoped AI agent that can read and write through a typed tool registry, with confirmation gates on every mutating call.
- A **React Native app** ships the same domain to the field, with push notifications and a touch Gantt.

49 Prisma models, 31 API route modules, 43 test files, and a CI pipeline that typechecks and tests every workspace package plus the out-of-workspace mobile app.

## Feature areas

<table>
<tr><td width="50%" valign="top">

### Work management
- List / Kanban / Gantt, at both project and workspace scope
- Subtask dependencies with drag-to-reschedule and dependency lines
- Cursor-paginated task lists with virtualised rows
- Tags, comments with read receipts, attachments, audit log
- Personal space: to-dos, direct messages, member board
- Meetings + calendar with agenda, week and month views
- Daily reports with structured entries and review flow

</td><td width="50%" valign="top">

### Procurement
- Indent → RFQ → quote → PO workflow with approval gates
- Vendor registry with GST registration and GSTIN API lookup
- Vendor material capability matrix with rates
- Quotation import: OCR (Tesseract) and PDF parsing into a grid
- Vendor comparison matrix and suggested-vendor matching
- Purchase orders with per-buyer-company numbering sequences
- Excel and PDF export

</td></tr>
<tr><td valign="top">

### People
- Attendance per shift schedule, with locations
- Face-embedding kiosk device flow behind a shared device secret
- Leave requests, public holidays, leave projections
- Departments with their own shift timings
- Birthdays and broadcast widgets

</td><td valign="top">

### Platform
- Better Auth sessions shared across web, API and mobile
- Pusher realtime with a no-op fallback in development
- Expo push notifications
- S3 / Cloudflare R2 uploads via presigned URLs
- Cron endpoints behind a shared secret
- Docker Compose for the whole stack

</td></tr>
</table>

## Architecture

```
                    ┌───────────────┐        ┌────────────────┐
                    │  Browser      │        │  Mobile (Expo) │
                    └───────┬───────┘        └────────┬───────┘
                            │ same-origin              │ direct
                            │ /api/v1/*                │ EXPO_PUBLIC_API_URL
                            ▼                          │
                    ┌──────────────────┐               │
                    │  apps/web        │               │
                    │  Next.js 15      │               │
                    │  RSC + Actions   │               │
                    │  proxies /api/v1 ├───────────────┤
                    └────────┬─────────┘               ▼
                             │              ┌────────────────────┐
                             │              │  apps/api          │
                             │              │  Hono, port 4000   │
                             │              │  31 route modules  │
                             │              └─────────┬──────────┘
                             │                        │
                             └──────────┬─────────────┘
                                        ▼
                        ┌───────────────────────────────┐
                        │  packages/core                │
                        │  services · permissions · zod │
                        │  Travis agent · notifications │
                        └───────────────┬───────────────┘
                                        ▼
                        ┌───────────────────────────────┐
                        │  packages/db — Prisma client  │
                        └───────────────┬───────────────┘
                                        ▼
                                   PostgreSQL
                     (pooled DATABASE_URL · direct DIRECT_URL)

            side channels: Pusher (realtime) · Expo (push) · S3/R2 (files)
                           Gemini (Travis) · GSTIN API (vendor verification)
```

**Why a standalone API next to a Next.js app.** The mobile client needs an origin it can call directly; Server Actions can't serve it. So the domain lives in `packages/core` as plain services, and two thin transports sit on top — Server Components and Actions for the web, Hono routes for everything else. The web app proxies `/api/v1/*` to the API service so the browser stays same-origin and the session cookie is forwarded untouched. Business logic is never duplicated between the two.

**`packages/core` is the actual product.** Route handlers and Server Actions parse input, resolve the caller, and delegate. Services own transactions, events and cache invalidation. That's why the API surface can be regenerated for a new client without touching a single rule.

## Permissions: three layers that all have to agree

The part most worth reading if you only read one thing.

```
1. Workspace role     OWNER · ADMIN · MANAGER · PROCUREMENT · ACCOUNTS · MEMBER · VIEWER
                      hardcoded matrix in workspace-access.ts
                                    ↓  AND
2. Project role       per-project membership matrix in project-access.ts
                                    ↓  AND
3. Capability grid    admin-editable overrides, resolved last-wins:
                      DEFAULT_CAPABILITIES[role]
                        → workspace override for role
                          → per-member override
```

The capability grid is **a ceiling, not a grant**. Unchecking `task:edit` for `MEMBER` removes it everywhere; checking it does *not* give a project-role `VIEWER` edit rights — the project matrix still has to pass. `OWNER` is deliberately un-overridable, because otherwise an admin could lock every human out of the settings page that fixes it.

Defaults are seeded from behaviour as it already shipped, so enabling the feature changes nothing until someone flips a switch. That's the difference between a permissions feature you can deploy on a Tuesday and one that pages you on a Tuesday night.

## Travis, the in-app agent

Travis answers questions and performs actions inside a workspace. The interesting part isn't the model call, it's the guard rails around it:

- **A typed tool registry** split into read tools and write tools, each with a Zod schema.
- **A contract module** (`travis/contract.ts`) defining the request shape and a discriminated-union event stream, structured so the transport can move from a single JSON envelope to SSE/NDJSON frames without a contract change.
- **Nothing from the client is trusted.** System messages are never accepted from the client; `selectedProjectId` and `selectedTaskId` are hints that get re-verified server-side against the caller's permissions before any tool runs.
- **Confirmation gates** on mutating tools — the agent proposes, the user confirms, and only then does the write execute.
- **Idempotency keys** persisted in `travisIdempotency`, so a retried request cannot create the same task twice.
- **Evals** committed alongside the code (`evals.test.ts`, `write-flow.test.ts`, `confirmation.test.ts`).

An LLM with database write access and no idempotency layer is an outage waiting for a flaky network. This one has the layer.

## Tech stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces — `apps/web`, `apps/api`, `apps/mobile`, `packages/{core,db,api-client}` |
| Web | Next.js 15 App Router, React 19, Tailwind, shadcn/ui, Zustand, TanStack Table + Virtual |
| API | Hono 4 on Node, `@hono/zod-validator`, 31 route modules |
| Mobile | Expo / React Native, React Navigation, Reanimated, custom Gantt and radial menu |
| Shared domain | `@tusker/core` — services, permissions, Zod schemas, notifications, Travis |
| Database | PostgreSQL + Prisma, 49 models, 35+ committed migrations |
| Auth | Better Auth (Google, GitHub, email), sessions shared across all three clients |
| Realtime | Pusher, with a no-op provider when unconfigured |
| Push | Expo Server SDK |
| Files | S3 / Cloudflare R2 presigned uploads |
| Documents | ExcelJS, jsPDF + autotable, pdfjs-dist, Tesseract.js OCR |
| AI | Google Gemini via `@google/generative-ai` |
| Testing | Vitest across web, api and core |
| Deploy | Docker Compose (api + web), Vercel config for the web app |

## Running it

### With Docker (recommended)

```bash
git clone https://github.com/vamsi80/Tusker-managment.git
cd Tusker-managment
cp .env.example .env      # fill in DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_*
docker compose up --build
```

Web on `http://localhost:3000`, API on `http://localhost:4000`.

### Locally

```bash
pnpm install
cp .env.example .env
pnpm db:migrate           # or: pnpm db:push
pnpm db:seed              # units of measure
pnpm dev                  # web + api in parallel
```

Individually: `pnpm dev:web`, `pnpm dev:api`, `pnpm db:studio`.

### Mobile

`apps/mobile` is intentionally **outside** the pnpm workspace — Expo's Metro bundler and pnpm's symlinked `node_modules` fight each other, and hoisting native modules breaks prebuild. It installs and runs on its own:

```bash
pnpm mobile:install
pnpm mobile          # dev client
pnpm mobile:go       # Expo Go
```

Point it at the API with `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`.

### Environment

One `.env` at the repo root, read by all three apps — Next via `next.config.ts`, the API via `--env-file`, Prisma via its CLI scripts. Every variable is validated by `packages/core/src/lib/env.ts` at boot, and optional integrations degrade rather than crash: uploads are disabled without S3 credentials, realtime falls back to a no-op provider without Pusher. See [`.env.example`](.env.example) for the full annotated list. `SKIP_ENV_VALIDATION=1` bypasses validation for CI and builds.

## Testing and CI

```bash
pnpm test         # vitest, every package
pnpm typecheck    # tsc --noEmit, every package
pnpm lint
```

43 test files, concentrated where the logic is riskiest rather than spread thin for a coverage number: procurement (indent workflow, PO numbering, GSTIN budget, vendor onboarding and deletion, quotation parsing and matching), attendance (shift resolution, leave projection), capabilities, task pagination, and the Travis write flow.

[`ci.yml`](.github/workflows/ci.yml) runs on every PR and on `main`: install with a frozen lockfile, typecheck all packages, run tests with dummy env values and no live services, typecheck mobile separately, then build. Database integration tests are opt-in behind `RUN_DB_INTEGRATION_TESTS=1` so CI never needs a live Postgres.

## Repository layout

```
apps/
├── web/                  Next.js 15 — RSC pages, Server Actions, /api/v1 proxy
│   └── src/app/w/[workspaceId]/     every authenticated surface lives here
├── api/                  Hono — 31 route modules, auth + capability middleware
└── mobile/               Expo — 30+ screens, own lockfile, outside the workspace
packages/
├── core/                 the domain
│   ├── lib/              auth, permissions, zod, notifications, storage, procurement
│   └── server/
│       ├── services/     task, project, procurement, attendance, leave, meeting…
│       ├── travis/       agent contract, tools, idempotency, confirmation, evals
│       └── crons/
├── db/                   Prisma schema, migrations, seeds, client
└── api-client/           typed fetch wrapper shared by web and mobile
```

Services follow a consistent `service / repository / mapper / events` split, so a route handler never touches Prisma directly and a mapper never touches a transaction.

## Design decisions worth arguing about

**Domain in a shared package, not in the Next.js app.** Costs an indirection layer. Buys a mobile app that can't drift from the web app's rules.

**Capability overrides as JSON columns, not a join table.** Overrides are sparse — only the deltas an admin actually changed are persisted — and always read as a whole map. A `WorkspaceMemberCapability` table would mean a join on every permission check to store a handful of booleans. If per-capability auditing is ever needed, this flips.

**Cursor pagination for tasks, not offset.** Boards get reordered while you're scrolling; offset pagination duplicates and skips rows when that happens.

**Pusher instead of self-hosted WebSockets.** One less stateful service to run, and the no-op fallback means contributors don't need an account to work on anything else.

**Mobile outside the workspace.** Documented above; an unusual choice that saves recurring Metro-versus-pnpm pain.

## Known gaps and roadmap

Stated plainly, because a README that claims a project is finished is a README nobody believes:

- [ ] **No end-to-end tests.** Unit coverage is good on services; the procurement workflow deserves a Playwright pass across the full indent → PO path.
- [ ] **Travis is single-turn against Gemini.** The event contract is streaming-ready but the runtime still returns one envelope; SSE is the next step.
- [ ] **Internal planning documents sit in the repo root** (`1.md`, `procurement_plan_*.md`, `project level setttings.md`, `RSC_PAYLOAD_ANALYSIS.md`). They belong in `docs/`, and some of them belong in an issue tracker instead.
- [ ] **`schema.prisma.bak` is committed.** Delete it; that's what git is for.
- [ ] **Model naming is inconsistent** — `attendance`, `conversation`, `notification`, `leave_request` are snake/lowercase while everything else is PascalCase, and `Clints`/`ClintMembers` are misspellings of `Clients`. A rename migration is overdue.
- [ ] **No OpenAPI spec** for the Hono API, despite every route already carrying a Zod schema. `hono-openapi` would generate it nearly free.
- [ ] **No observability.** Structured logging exists (`lib/logger.ts`); no tracing, no error reporting, no dashboards.
- [ ] **Face-embedding attendance has no documented threat model.** Biometric data in Postgres needs an explicit retention and consent policy before it goes anywhere near production.

## License

See [LICENSE](LICENSE).

---

<div align="center">

Built by [**vamsi80**](https://github.com/vamsi80) · [LinkedIn](https://linkedin.com/in/vamsikrishna-m/) · [Portfolio](https://portfolio-eta-tan-14.vercel.app/)

</div>