# Monorepo Separation Progress Checklist

- [x] Step 0 — Create `TODO.md` in the repo root
- [x] Step 1 — Fix `types/attendance.ts` and `types/leave.ts`
- [x] Step 2 — Fix bare `prisma.` calls (replace with `getDb()`)
- [x] Step 3 — Fix `get-daily-reports.ts` undefined `actorId`
- [x] Step 4 — Fix `auth` middleware `c.set()` type errors
- [x] Step 5 — Generate Prisma client in `apps/api`
- [x] Step 6 — Run type-check and fix remaining errors
- [x] Step 7 — Set up local dev environment
- [x] Step 8 — Smoke test locally
