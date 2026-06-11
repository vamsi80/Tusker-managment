# Full `any` Type Elimination — Tusker Monorepo
**Date:** 2026-06-11 | **Scope:** 1,111 `any` usages across 183 files

## Context
All previous `any`-elimination work was lost when `git filter-repo --force` discarded uncommitted working-tree edits. This plan covers the complete remaining work from scratch. The API layer (`apps/api/src`) has 383 `any` instances across 44 files; the web layer (`apps/web/src`) has 728 across 139 files.

**Goal:** Zero `: any` / `as any` across both apps, with `tsc --noEmit` passing clean.

---

## Typing Rules (apply everywhere, no exceptions)

| Pattern | Fix |
|---|---|
| `catch (err: any)` | `catch (err: unknown)` + `const e = err as { message?: string; code?: string }` at point of use |
| `(e: any)` React event | `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`, etc. |
| `payload: any` / `data: any` in event/pubsub | `Record<string, unknown>` |
| `Record<string, any>` | `Record<string, unknown>` |
| `as any` cast for Prisma JSON | `as Prisma.InputJsonValue` (import from `@/generated/prisma`) |
| `as any` cast for HTTP status | `as StatusCode` (import from `hono/utils/http-status`) |
| `opts: any` / `filters: any` | `Partial<WorkspaceFilterOpts>` (import from `@/types/task`) |
| `task: any` / `t: any` | `WorkspaceTaskType` (import from `@/types/task`) |
| `patchData: any` Prisma update | `Prisma.TaskUpdateInput` |
| `cursor?: any` | `string | null | undefined` |
| `meta: any` API response | `{ nextCursor?: string | null; totalCount?: number; hasMore?: boolean }` |
| `row: any` in data-table | Generic `<TData>` parameter on the component |
| `options?: any` (router.push) | `Parameters<typeof router.push>[1]` |
| `(obj as any)[dynamicKey]` | `(obj as Record<string, unknown>)[dynamicKey]` |
| `any[]` return / param | Replace with the correct domain type array |
| `Promise<any>` in api-client | `Promise<ActualResponseType>` — define or import the shape |
| `project: any` in events | `{ id: string; [key: string]: unknown }` |
| `comment: any` in events | `{ user: { id: string; surname: string }; [key: string]: unknown }` |
| `status as any` | `status as StatusCode` |
| `metadata as any` | `metadata as Prisma.InputJsonValue` |
| `(prisma as any).$pool` | `(prisma as PrismaClient & { $pool: Pool }).$pool` |

---

## Batch 1 — API: Type Definitions (fix first, unblocks everything else)

**Files:**
- `apps/api/src/types/task.ts` — fix `permissions: any`, `nextCursor: any`, `cursor?: any`
- `apps/api/src/types/workspace.ts` — fix `members?: any[]`, `projects: any[]`, `projectManagers: Record<string, any[]>`

**What to do:**
- In `types/task.ts`: Replace `nextCursor: any` → `string | null | undefined`; replace `permissions: any` → define an inline `WorkspacePermissions` interface with the real fields (role, canEdit, canDelete, etc.)
- In `types/workspace.ts`: Replace `any[]` with the correct member/project types that already exist in the same file or adjacent type files

---

## Batch 2 — API: Infrastructure & Utilities

**Files (in order):**
1. `apps/api/src/lib/db.ts` — 1 instance: `(prisma as any).$pool` → `(prisma as PrismaClient & { $pool: Pool }).$pool`; import `Pool` from `@neondatabase/serverless` or `pg`
2. `apps/api/src/lib/registry.ts` — 1 instance: same `$pool` pattern
3. `apps/api/src/lib/audit.ts` — 12 instances:
   - `oldData?: any` / `newData?: any` → `Record<string, unknown> | null | undefined`
   - `metadata: any` → `Prisma.InputJsonValue`
   - `catch (err: any)` (×4) → `catch (err: unknown)`
   - `(payload as any).id` → `(payload as Record<string, unknown>).id`
   - `calculateDelta(oldObj: any, newObj: any)` → `(oldObj: Record<string, unknown>, newObj: Record<string, unknown>)`
   - `const delta: any` → `Record<string, unknown>`
4. `apps/api/src/lib/realtime.ts` — 5 instances: all `payload: any` / `payload?: any` → `Record<string, unknown>`
5. `apps/api/src/lib/slug-generator.ts` — 3 instances: read file, replace with `unknown` + narrow
6. `apps/api/src/lib/tasks/filter-utils.ts` — 7 instances: params typed as `Partial<WorkspaceFilterOpts>`
7. `apps/api/src/lib/tasks/query-builder.ts` — 23 instances: use `Prisma.TaskWhereInput`, `Prisma.TaskOrderByWithRelationInput`, `WorkspaceFilterOpts` throughout

---

## Batch 3 — API: Data Layer (repositories & mappers)

**Files:**
1. `apps/api/src/data/user/get-user-permissions.ts` — 3 instances: `} as any` → `} as WorkspacePermissionsLean | WorkspacePermissionsFull`
2. `apps/api/src/data/attendance/get-attendance-settings.ts` — 1 instance
3. `apps/api/src/server/services/task/task.mapper.ts` — 10 instances: export `FlattenableUser` type; use `WorkspaceTaskType` for task params
4. `apps/api/src/server/services/task/task.repository.ts` — 24 instances:
   - `attachment?: any` → inline attachment shape
   - `findNotifications(where: any, commentInclude: any)` → `Prisma.NotificationWhereInput`, `Prisma.CommentInclude`
   - `newStatus: any | TaskStatus` → `TaskStatus`
   - `buildOrderBy(sorts as any)` → `Array<{ field: string; direction: "asc" | "desc" }> | undefined`
5. `apps/api/src/server/services/project/project.mapper.ts` — 9 instances: export `DBWorkspaceMemberPermissionsInput`, `DBProjectMemberPermissionsInput`, `DBProjectMemberUIInput`
6. `apps/api/src/server/services/project/project.repository.ts` — 5 instances
7. `apps/api/src/server/services/comment/comment.mapper.ts` — 8 instances
8. `apps/api/src/server/services/comment/comment.repository.ts` — 4 instances
9. `apps/api/src/server/services/attendance/attendance.mapper.ts` — 1 instance
10. `apps/api/src/server/services/attendance/attendance.repository.ts` — 6 instances
11. `apps/api/src/server/services/leave/leave.mapper.ts` — 2 instances
12. `apps/api/src/server/services/leave/leave.repository.ts` — 6 instances
13. `apps/api/src/server/services/procurement/indent/indent.repository.ts` — 2 instances

---

## Batch 4 — API: Service Layer

**Files:**
1. `apps/api/src/server/services/task/tasks.service.ts` — 129 instances (largest file):
   - `mapToLegacyMetadata(task: any)` → `WorkspaceTaskType`
   - `toLegacy = (obj: any)` → `FlattenableUser` (exported from task.mapper.ts)
   - All `mapToFlatMetadata(t as any)` → `(t as WorkspaceTaskType)` (use replace_all)
   - `)) as any[]` → `)) as WorkspaceTaskType[]`
   - `(lastTask as any)[SORT_MAP[...].dbField]` → `(lastTask as Record<string, unknown>)[...]`
   - `patchData: any = {}` → `Prisma.TaskUpdateInput = {}`
   - `filters: any = {}` → `Partial<WorkspaceFilterOpts> = {}` (replace_all across all methods)
   - `const createdItems: any[]` → `WorkspaceTaskType[]`
   - `catch (err: any)` (×many) → `catch (err: unknown)`
   - `opts: any` → `WorkspaceFilterOpts`
2. `apps/api/src/server/services/project/project.service.ts` — 23 instances:
   - `projectMembers: any[]` → `DBProjectMemberUIInput[]`
   - `workspaceAdmins: any[]` → explicit inline object type
   - `workspaceMember: any` → `DBWorkspaceMemberPermissionsInput | null | undefined`
   - `projectMember: any` → `DBProjectMemberPermissionsInput | null | undefined`
   - Remove `as any[]` casts where TypeScript can infer
3. `apps/api/src/server/services/workspace.service.ts` — 20 instances:
   - `const where: any` → `Prisma.WorkspaceWhereInput`
   - `catch (err: any)` → `catch (err: unknown)`
   - `as any` casts → proper Prisma types
4. `apps/api/src/server/services/attendance/attendance.service.ts` — 10 instances
5. `apps/api/src/server/services/comment/comment.service.ts` — 4 instances:
   - `let attachmentJson: any` → `Prisma.InputJsonValue | null`
   - `const where: any` → `Prisma.CommentWhereInput`
6. `apps/api/src/server/services/report.service.ts` — 2 instances: `entries?: any[]` → inline typed array
7. `apps/api/src/server/services/leave/leave.service.ts` — 1 instance
8. `apps/api/src/server/services/conversation/conversation.service.ts` — 2 instances
9. `apps/api/src/server/services/procurement/indent/indent.service.ts` — 1 instance

---

## Batch 5 — API: Event Files

**Files:**
1. `apps/api/src/server/services/attendance/attendance.events.ts` — 4 instances: define `AttendanceRecord` type; type all params
2. `apps/api/src/server/services/task/task.events.ts` — 4 instances: `task: any` → `{ id: string; projectId: string; [key: string]: unknown }`
3. `apps/api/src/server/services/leave/leave.events.ts` — 2 instances: define `LeaveRequestBasic = { id: string; workspaceMemberId: string; [key: string]: unknown }`
4. `apps/api/src/server/services/comment/comment.events.ts` — 1 instance: `comment: any` → `{ user: { id: string; surname: string }; [key: string]: unknown }`
5. `apps/api/src/server/services/project/project.events.ts` — 1 instance: `project: any` → `{ id: string; [key: string]: unknown }`

---

## Batch 6 — API: Routes & Middleware

**Files:**
1. `apps/api/src/hono/routes/tasks.ts` — 5 instances:
   - `const opts: any` → `WorkspaceFilterOpts`
   - `const filters: any` → `Partial<WorkspaceFilterOpts>` (×2)
   - `result as any` / `updated as any` → `as WorkspaceTaskType`
   - `(q.hm as any)` → `(q.hm as WorkspaceFilterOpts["hierarchyMode"])`
2. `apps/api/src/hono/routes/task-views.ts` — 1 instance: `const opts: any` → `WorkspaceFilterOpts`
3. `apps/api/src/hono/routes/attendance.ts` — 17 instances: `status as any` → `status as StatusCode` (×multiple)
4. `apps/api/src/hono/routes/auth.ts` — 1 instance
5. `apps/api/src/hono/routes/cron.ts` — 2 instances
6. `apps/api/src/hono/middleware/auth.ts` — 3 instances
7. `apps/api/src/hono/middleware/rate-limit.ts` — 1 instance
8. `apps/api/src/server/crons/registry.ts` — 3 instances

---

## Batch 7 — Web: API Client Layer (fix before components, unblocks return types)

**Files:**
- `apps/web/src/lib/api-client/projects.ts` — 30 instances: replace `Promise<any>` / `Promise<any[]>` with proper response types. Define response interfaces inline or import from `@/types/project`
- `apps/web/src/lib/api-client/workspaces.ts` — 30 instances: same pattern
- `apps/web/src/lib/api-client/tasks.ts` — 20 instances: use `WorkspaceTaskType`, define cursor/meta shapes
- `apps/web/src/lib/api-client/comments.ts` — 18 instances: `items: any[]` → typed array; `error: any` → `unknown`
- `apps/web/src/lib/api-client/reports.ts` — 6 instances
- Any remaining `apps/web/src/lib/api-client/*.ts` files

---

## Batch 8 — Web: Infrastructure & Shared Utilities

**Files:**
1. `apps/web/src/lib/pubsub.ts` — `EventCallback = (data: any)` → `(data: unknown)`; `publish(event, data: any)` → `(data: unknown)`
2. `apps/web/src/lib/realtime.ts` — all `payload: any` → `Record<string, unknown>` in all 4 event types
3. `apps/web/src/lib/cache/invalidation.ts` — 27 instances: `"layout" as any` repeated pattern → cast to the correct revalidation tag union type
4. `apps/web/src/lib/store/workspace-layout-store.ts` — `project: any` → import `ProjectListItem` from `@/types/project`; pubsub callback → typed
5. `apps/web/src/lib/store/workspace-member-store.ts` — `EMPTY_ARRAY: any[]` → `never[]`
6. `apps/web/src/hooks/use-filtered-fetch.ts` — `meta: any` → `{ nextCursor?: string | null; totalCount?: number; hasMore?: boolean }`; `cursor?: any` → `string | null | undefined`; `nextCursor: any` → same
7. `apps/web/src/hooks/use-safe-navigation.ts` — `options?: any` → `Parameters<typeof router.push>[1]`
8. `apps/web/src/contexts/subtask-sheet-context.tsx` — 6 instances

---

## Batch 9 — Web: Shared Component Types

**Files:**
1. `apps/web/src/components/task/shared/types.ts` — fix all `any` — this unblocks all task components
2. `apps/web/src/components/task/gantt/types.ts` — same
3. `apps/web/src/components/task/gantt/transform-tasks.ts` — 8 instances
4. `apps/web/src/components/data-table/data-table.tsx` — `onRowSelectionChange?: (value: any)` → generic `<TData>` param
5. `apps/web/src/components/data-table/column-helpers.tsx`
6. `apps/web/src/components/data-table/row-actions.tsx` — `row: any` → generic `<TData>`
7. `apps/web/src/components/ui/multi-select-tags.tsx`

---

## Batch 10 — Web: Task Components (kanban / list / gantt)

**Files:**
1. `apps/web/src/components/task/kanban/kanban-board.tsx` — 27 instances
2. `apps/web/src/components/task/kanban/kanban-card.tsx` — 15 instances
3. `apps/web/src/components/task/list/task-row.tsx` — 15 instances
4. `apps/web/src/components/task/list/subtask-row.tsx` — 20 instances
5. `apps/web/src/components/task/list/inline-subtask-form.tsx` — 6 instances
6. `apps/web/src/components/task/list/group/flat-task-list.tsx` — 19 instances
7. `apps/web/src/components/task/list/group/project-task-group.tsx` — 23 instances
8. `apps/web/src/components/task/list/task-table/hooks/use-task-table-logic.ts` — 24 instances
9. `apps/web/src/components/task/list/task-table/context/task-table-context-object.ts`
10. `apps/web/src/components/task/list/task-table/components/task-table-body.tsx` — 11 instances
11. `apps/web/src/components/task/gantt/gantt-chart.tsx`
12. `apps/web/src/components/task/gantt/task-row.tsx`
13. `apps/web/src/components/task/gantt/draggable-subtask-bar.tsx`
14. `apps/web/src/components/task/gantt/sortable-subtask-list.tsx` — 7 instances
15. `apps/web/src/components/task/gantt/export-utils.ts`
16. `apps/web/src/components/task/shared/subtask-status-changer.tsx`
17. `apps/web/src/components/task/shared/global-filter-toolbar.tsx`

---

## Batch 11 — Web: Auth & Sidebar

**Files:**
1. `apps/web/src/app/(auth)/sign-in/_components/loginForm.tsx`
2. `apps/web/src/app/(auth)/sign-up/_components/signUpForm.tsx`
3. `apps/web/src/app/(auth)/create-workspace/_components/create-workspace-form.tsx`
4. `apps/web/src/app/(auth)/forgot-password/_components/forgot-password-form.tsx`
5. `apps/web/src/app/(auth)/verify-request/_components/verifyRequestclinte.tsx`
6. `apps/web/src/app/w/_components/sidebar/` — all files in this directory
7. `apps/web/src/app/w/_components/auth/accept-invitation-form.tsx`
8. `apps/web/src/app/(main)/_components/navbar.tsx`

---

## Batch 12 — Web: Workspace Pages

**Files (all under `apps/web/src/app/w/[workspaceId]/`):**
1. Route file: `app/w/route.ts`
2. Project pages: `createProject/page.tsx`, `editProject/page.tsx`, `editProject/[projectId]/page.tsx`
3. Info: `info/_components/workspace-info-form.tsx`
4. Conversations: `myspace/conversations/` (4 files)
5. Notifications: `notifications/_components/` (3 files) — `notifications-context.tsx` has 7 instances
6. Project list: `p/page.tsx`, `p/_components/create-project-form.tsx`
7. Project detail (15 files under `p/[slug]/_components/`):
   - `forms/edit-subtask-form.tsx` — 26 instances (largest)
   - `forms/bulk-upload-form.tsx` — 9 instances
   - `gantt/project-gantt-client.tsx` — 11 instances
   - `kanban/project-kanban-view.tsx`
   - `list/project-task-list-view.tsx` — 8 instances
   - `shared/subtaskSheet/subtask-details-sheet.tsx` — 7 instances
   - remaining shared/dashboard files
8. Materials: `p/[slug]/materials/_components/materials-table.tsx`
9. Procurement (project-level): `p/[slug]/procurement/` (3 files)
10. Procurement (workspace-level): `procurement/_components/` (5 files) + `procurement/rfqs/create/_components/create-rfq-client.tsx` (8 instances) + `procurement/indents/[indentId]/_components/indent-detail-client.tsx`
11. Procurement components: `_components/procurement/` (4 files) + `_components/procurement/line-item-table.tsx` (12 instances)
12. Reports: `reports/_components/report-table.tsx` (13 instances) + 2 other report files
13. Settings: `settings/` (2 files)
14. Tasks views: `tasks/_components/views/gantt/workspace-gantt-client.tsx` (14 instances) + `tasks/_components/views/kanban/workspace-kanban-view.tsx`
15. Team: `team/` (7 files)
16. Vendors: `vendors/[vendorId]/_components/vendor-capabilities.tsx` (6 instances) + 2 other vendor files
17. Realtime: `_components/realtime-notification-listener.tsx`

---

## Execution Instructions for Codex

1. **Work batch by batch in order** — later batches depend on types defined in earlier ones
2. **Read each file before editing** — never guess at the current content
3. **One file at a time** — edit, then move on; don't batch edits across files in one shot
4. **After every 10 files**, run: `cd apps/api && npx tsc --noEmit 2>&1 | tail -20` and `cd apps/web && npx tsc --noEmit 2>&1 | tail -20` to catch regressions early
5. **Never use `as any` as a fix** — if a type is hard, use `unknown` + narrow, or define a minimal interface
6. **Prisma imports**: `import { Prisma } from "@/generated/prisma"` in API files
7. **Domain type imports in API**: `import type { WorkspaceTaskType, WorkspaceFilterOpts } from "@/types/task"`
8. **Domain type imports in Web**: `import type { WorkspaceTaskType } from "@/types/task"` (path may vary)

---

## Final Verification

```bash
# Must both return 0 results:
grep -rn ": any\|as any\|any\[\]\|Promise<any>\|Record<string, any>" apps/api/src --include="*.ts"
grep -rn ": any\|as any\|any\[\]\|Promise<any>\|Record<string, any>" apps/web/src --include="*.ts" --include="*.tsx"

# Must both exit 0 with no errors:
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```
