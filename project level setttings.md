Ready for review
Select text to add comments on the plan
Project-level settings — per-member permission matrix
Context
Today a project's behaviour is governed by hard-coded project-role rules in the service layer. There is no way to say "Vaishnavi may bulk upload on this project". The workspace capability grid looks like it should do this, but it cannot: it holds only 6 capabilities (project:create, task:create, task:edit, task:status, procurement:view, vendors:view), and every task capability already defaults to true for every role. It is documented as "a ceiling, not a grant" (capabilities.ts:6-9). That is exactly why ticking every workspace permission for a user changes nothing — the real gate is hasExecutionRole (PM / Coordinator / Lead) in permissions.ts:250-252.

This adds a Project Settings dialog off the project kebab menu: a matrix of 8 permissions (columns) × project members (rows) with checkboxes, plus 4 project-wide defaults beneath it.

Decisions settled with the user
Question Decision
Matrix rows Individual members, not roles
The 12 asked-for settings Split: 8 in the matrix, 4 as project-wide defaults
Precedence Project matrix is authoritative — it may grant and revoke
Existing role rules Replaced for these 8 permissions
The split
Matrix (per member, checkbox): create task · edit task · change status · set COMPLETED · set HOLD · set CANCELLED · bulk upload · raise indent

Project-wide defaults (one value each, below the matrix): mandatory comment · mandatory attachment · default task duration · default assignee

Only 3 of the 8 map to an existing workspace capability. The other 5 have no workspace representation at all and are hard-coded today.

Assumptions worth confirming during build
Ownership scoping survives. Today a MEMBER may only change status on a task they created or are assigned (tasks.service.ts:1960-1974). The matrix decides whether the person may perform the action at all; that "own task" scoping stays as an orthogonal rule. Dropping it would let any ticked member restatus anyone's task.
Comment and attachment are one rule today, not two — isMandatoryTransition requires comment || attachment (tasks.service.ts:2015-2026). Splitting into two independent flags is a real behaviour change.
Rows are real ProjectMember rows. getMembers injects workspace OWNER/ADMIN who have no ProjectMember row (project.service.ts:592), giving them a projectMemberId that is actually a WorkspaceMember id — a footgun if writes key on it. Those admins are shown read-only and keep workspace-level access; there is no row to store an override on.
Design
Storage — two additive nullable columns
model ProjectMember { permissionOverrides Json? } // { "bulk:upload": true, ... } per member
model Project { settings Json? } // the 4 project-wide defaults
One migration, both nullable, no backfill — copying 20260825120000_add_permission_overrides verbatim in shape. Sparse deltas mean an unconfigured project stores nothing and behaves exactly as today.

Migration trap: this database connects with search_path = boq, public. ALTER TABLE ... ADD COLUMN ... JSONB is safe, but any CREATE TYPE must be written public."Foo" or Prisma fails with 42704. This migration needs no new type.

Resolution — one new module
packages/core/src/lib/constants/project-permissions.ts, deliberately mirroring capabilities.ts: no server-only (so the dialog can preview resolution live), and the same junk-tolerant coercers so malformed JSON degrades to {} instead of throwing. Reuse coerceOverrides' pattern directly.

export const PROJECT_PERMISSIONS = [ /* 8 × {id, label, group} */ ] as const;

export const DEFAULT_PROJECT_PERMISSIONS: Record<ProjectRole, ProjectPermissionMap>;
// Seeded from behaviour as it ships today, so nothing changes until a box is ticked:
// PROJECT_MANAGER | PROJECT_COORDINATOR | LEAD -> all true
// MEMBER -> task:status only (still ownership-scoped); create/edit/bulk false
// VIEWER -> all false

export function resolveProjectPermissions(
projectRole: ProjectRole | null,
memberOverrides?: unknown,
workspaceCaps?: CapabilityMap, // outer ceiling, the 3 mapped ids only
isWorkspaceAdmin?: boolean, // never locked out of their own project
): ProjectPermissionMap;
Precedence, last wins: DEFAULT_PROJECT_PERMISSIONS[projectRole] → ProjectMember.permissionOverrides. The workspace grid still caps task:create / task:edit / task:status — an admin who revoked task:edit workspace-wide must not be overridden by a project PM.

Enforcement — replace the role checks at each verified choke point
All of these currently hard-code project roles; each becomes a resolveProjectPermissions(...) read.

Setting Server choke point
create task tasks.ts:321, :377; role gate tasks.service.ts:48-49, :1795-1799
edit task tasks.ts:743 (+ :651, :699, :512, :1111); tasks.service.ts:2146-2192
change status tasks.ts:551, :588; tasks.service.ts:1960-1974
COMPLETED / HOLD / CANCELLED tasks.service.ts:1980-1991 — one shared predicate today, no per-status branching. Splitting into 3 columns means 3 flags here
bulk upload tasks.ts:429-433 — the only real gate; the service does no role check
raise indent indent.service.ts:280-281 via procurement-indents.ts:318-322; ensureCanMutate blocks only ACCOUNTS today
mandatory comment/attachment tasks.service.ts:2015-2026 and the edit-path copy at :2252-2262
default duration no server default; hard-coded days: 1 in create-subTask-form.tsx:80-107 and inline-subtask-form.tsx:74-83
default assignee no auto-assign exists; tasks.service.ts:1820-1827
API
GET / PATCH /projects/:projectId/settings in apps/api/src/hono/routes/projects.ts, beside the existing GET /:projectId/permissions. Zod at the boundary. Guard reuses permissions.isWorkspaceAdmin || isProjectAdmin(...), the same one already on updateProject.

Follow update-permissions.ts exactly: value: z.boolean().nullable(), where null clears the override and falls back to the role default; write {} rather than undefined when clearing the last key (Prisma reads undefined as "leave alone"). On write call recordActivity({ broadcastEvent: "team_update" }) so other sessions don't run stale — the workspace permissions action omits this and that is a bug not to copy.

UI
Entry point: a new "Project settings" item in the kebab at nav-projects.tsx:209-274, gated on canManageMembers, opening a Dialog — the same shape as the existing "Manage Members" item (handleManageMembersClick, :111-132). projectId, slug and workspaceId are already in hand, no extra lookup.

The sidebar sits outside ProjectLayoutProvider, so useProjectLayout() is unavailable here. Fetch on open, exactly as handleManageMembersClick already does via projectsClient.getFullData.

Dialog shell: copy quotation-import-dialog.tsx:192 — max-w-5xl max-h-[85vh] overflow-hidden flex flex-col with a sticky TableHeader.

The matrix: copy permissions-manager.tsx:133-176 — a real <table> in overflow-x-auto with a min-w-[720px] floor, per-checkbox optimistic write with rollback, no save button. Ours is the transpose (members as rows, permissions as columns) and 8 columns wide, so the horizontal scroll matters more. Reuse its "send null when the new value equals the resolved default" trick and its per-row "Reset to role" action.

Defaults section: one form + Save beneath the matrix, following the hasChanges diff and single bulk PATCH used by attendance-settings.tsx.

Client duplication — must be fixed, not worked around
The transition rules exist in three places: tasks.service.ts:1980-2026, a second server copy on the edit path at :2217-2262, and a character-for-character client copy in subtask-status-changer.tsx:92-149. Every matrix permission must feed all three or the UI will offer moves the API rejects. The lazy fix is to export one predicate from project-permissions.ts and call it from all three, deleting the duplicates.

Build order
Stage 0 — plumbing. Migration; project-permissions.ts + tests; both columns threaded through getProjectLayoutData; GET/PATCH endpoints; kebab item and dialog rendering the matrix read-only. Proves the pipe end to end.

Stage 1 — the 3 mapped permissions. create / edit / change-status. Wire the matrix into tasks.ts route gates and the tasks.service.ts role checks. Smallest blast radius, and validates the ceiling interaction with the workspace grid.

Stage 2 — the 3 status permissions. COMPLETED / HOLD / CANCELLED. Requires splitting the single canCompleteOrHoldOrCancel predicate into three, in both server copies and the client.

Stage 3 — bulk upload + raise indent. Bulk is a one-line route change. Indent adds a project-role gate where none exists today — check it does not break workspace-level indent creation outside a project.

Stage 4 — the 4 project defaults. Mandatory comment/attachment (splitting the existing OR), default duration, default assignee.

Verification
pnpm --filter @tusker/db exec prisma migrate dev then prisma validate; confirm both columns exist and no project data moved.
pnpm -r test -- --run — new resolution tests in packages/core/src/lib/**tests**/. Must-have cases: an unconfigured project resolves identically to today's behaviour for all 5 project roles; a project override cannot exceed a revoked workspace capability; malformed JSON degrades to {}. Baseline: apps/api has 1 pre-existing failure (kiosk roster nickname) — the count must not rise.
pnpm -r typecheck plus apps/web tsc — current baseline is 0 errors; it must stay 0.
Manually, per stage: as PM, untick change status for one member; confirm that member cannot move a task and that the API rejects it, not merely that the button is hidden. Then tick bulk upload for a plain MEMBER and confirm they can actually upload — that is the case that is impossible today and the whole reason for this feature.
Open a project that has never been configured and confirm every behaviour is identical to today (NULL columns ⇒ pure defaults).
Dead code to delete while in here
apps/web/src/app/w/\_components/sidebar/projectsList/options/edit-project-form.tsx and manage-members-button.tsx are both unreferenced — nothing imports EditProjectForm or ManageMembersButton. They sit in the exact directory this work starts from.
