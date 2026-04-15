# Query Builder Refactoring Plan

This plan covers five surgical, non-breaking improvements to the `src/lib/tasks` data layer: fixing the `assigneeId` schema dual-key problem, extracting shared cursor/AND utilities, splitting access control out of the monolithic where-builder, removing implicit `view_mode` inference, and deleting the dead caching path in `getTasks`.

---

## 1 — Fix `assigneeId` Schema Inconsistency

**Root cause:** `Task.assigneeId` is a FK to `ProjectMember.id`, but every access-control clause also checks `Task.assignee.workspaceMember.userId` (a UserId). This means every single `assigneeId` filter needs a dual `{ assigneeId } || { assignee: { workspaceMember: { userId } } }` OR, adding a JOIN on every query.

**Occurs in:**
- `buildProjectRootWhere` — line 146, 148, 159, 161
- `buildSubtaskExpansionWhere` — line 240, 252
- `buildWorkspaceFilterWhere` — line 377, 384, 392, 402, 408, 452, 454
- `buildSubTaskConditions` in `filter-utils.ts` — line 141-142

**Fix:** Introduce a single utility:

```ts
// query-builder.ts
export function buildAssigneeFilter(memberIdOrUserId: string | string[]): Prisma.TaskWhereInput {
    const single = Array.isArray(memberIdOrUserId) ? memberIdOrUserId[0] : memberIdOrUserId;
    const isMany = Array.isArray(memberIdOrUserId) && memberIdOrUserId.length > 1;
    const idFilter = isMany ? { in: memberIdOrUserId as string[] } : single;

    return {
        OR: [
            { assigneeId: idFilter as any },
            { assignee: { workspaceMember: { userId: idFilter as any } } },
        ],
    };
}
```

Then replace every manually duplicated `{ assigneeId: x } | { assignee: { workspaceMember: { userId: x } } }` block with a call to `buildAssigneeFilter(x)`. The **subtask check** variant (which adds the `subTasks.some` arm for parent scoping) gets its own helper:

```ts
export function buildParentAssigneeFilter(memberIdOrUserId: string | string[]): Prisma.TaskWhereInput {
    const leaf = buildAssigneeFilter(memberIdOrUserId);
    return { OR: [ leaf, { subTasks: { some: leaf } } ] };
}
```

#### [MODIFY] [query-builder.ts](file:///c:/VamsiKrishna/Github/Tusker-managment/src/lib/tasks/query-builder.ts)
- Add `buildAssigneeFilter` and `buildParentAssigneeFilter` near the top (after `TaskCursor`).
- Replace the 10+ manual OR blocks in all three builder functions.

#### [MODIFY] [filter-utils.ts](file:///c:/VamsiKrishna/Github/Tusker-managment/src/lib/tasks/filter-utils.ts)
- Import and use `buildAssigneeFilter` in `buildSubTaskConditions`.

---

## 2 — Extract `buildCursorWhere` and `appendAnd` as Shared Utilities

**Root cause:** The cursor pagination pattern:
```ts
where.AND = [...(Array.isArray(where.AND) ? where.AND : (where.AND ? [where.AND] : [])), cursorCondition];
```
is copy-pasted **4 times** across `buildProjectRootWhere`, `buildSubtaskExpansionWhere`, and `buildWorkspaceFilterWhere`. Likewise every `appendAnd` push is manually done inline.

**Fix:** Extract two helpers:

```ts
/** Safely merge a condition into where.AND without blowing away existing clauses. */
export function appendAnd(where: Prisma.TaskWhereInput, ...conditions: Prisma.TaskWhereInput[]): void {
    const existing = where.AND
        ? (Array.isArray(where.AND) ? where.AND : [where.AND])
        : [];
    where.AND = [...existing, ...conditions] as any;
}

/** Build a standard createdAt DESC cursor condition. */
export function buildCursorWhere(cursor: TaskCursor): Prisma.TaskWhereInput {
    return {
        OR: [
            { createdAt: { lt: cursor.createdAt } },
            { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
        ],
    };
}
```

#### [MODIFY] [query-builder.ts](file:///c:/VamsiKrishna/Github/Tusker-managment/src/lib/tasks/query-builder.ts)
- Add `appendAnd` and `buildCursorWhere` as exported utilities.
- Replace all 4 cursor injection blocks and all manual `where.AND = [...]` spreads with calls to `appendAnd` / `buildCursorWhere`.

---

## 3 — Split Access Control Out of `buildWorkspaceFilterWhere`

**Root cause:** `buildWorkspaceFilterWhere` is a 200-line function doing two completely different jobs: computing access-control scope (admin/full/restricted project sets) AND applying user-typed filters (status, tag, search, date). These concerns are interleaved — making it impossible to unit-test either in isolation.

**Fix:** Extract `buildAccessScopeWhere`:

```ts
export interface AccessScope {
    workspaceId: string;
    projectId?: string;
    projectIds?: string[];
    isAdmin: boolean;
    fullAccessProjectIds: string[];
    restrictedProjectIds: string[];
    /** Whether to include subTasks.some visibility for restricted parents */
    includeChildVisibility?: boolean;
}

export function buildAccessScopeWhere(scope: AccessScope, userId: string): Prisma.TaskWhereInput {
    // ... move the entire admin/full/restricted branching logic here
}
```

`buildWorkspaceFilterWhere` becomes a thin coordinator:

```ts
export function buildWorkspaceFilterWhere(opts: WorkspaceFilterOpts, userId: string): Prisma.TaskWhereInput {
    // 1. Start from access scope
    const where = buildAccessScopeWhere({ ...opts }, userId);
    // 2. Apply user filters: status, tag, assignee, dates, search
    // 3. Apply cursor
    return where;
}
```

#### [MODIFY] [query-builder.ts](file:///c:/VamsiKrishna/Github/Tusker-managment/src/lib/tasks/query-builder.ts)
- Add `AccessScope` interface and `buildAccessScopeWhere` function.
- Shrink `buildWorkspaceFilterWhere` to a coordinator using the new function.

---

## 4 — Remove `view_mode` Inference — Use Explicit Flags Only

**Root cause:** `buildWorkspaceFilterWhere` contains:
```ts
const isList = view_mode === "list" || view_mode === "default";
const isKanban = view_mode === "kanban";
const isGantt = view_mode === "gantt";
```
and then uses these flags on line 374 and 482 to decide hierarchy scoping:
```ts
if (opts.onlyParents || isKanban || isList || isGantt || isSearch) { ... }
```
This means a WHERE builder is changing its output based on an implied view-mode string, rather than the caller explicitly passing the desired scope. It also means callers must know the magic strings to get the right behavior.

**Fix:** Delete `view_mode` from `WorkspaceFilterOpts`. Replace usages with explicit boolean flags that already exist: `onlyParents`, `excludeParents`, `onlySubtasks`.

> [!WARNING]
> Before deleting `view_mode` from the opts interface, every caller must already be passing a superset of the explicit flags. Audit all 5 call sites in `get-tasks.ts` first.

#### [MODIFY] [query-builder.ts](file:///c:/VamsiKrishna/Github/Tusker-managment/src/lib/tasks/query-builder.ts)
- Remove `view_mode?: string` from `WorkspaceFilterOpts`.
- Delete the `isList / isKanban / isGantt / isSearch` local variables.
- Replace the two view-mode-dependent branches with explicit flag checks.

#### [MODIFY] [get-tasks.ts](file:///c:/VamsiKrishna/Github/Tusker-managment/src/data/task/get-tasks.ts)
- At all 5 `buildWorkspaceFilterWhere` call sites: remove `view_mode` and ensure `onlyParents` / `onlySubtasks` / `excludeParents` are set correctly instead.

---

## 5 — Decide on One User-Fetching Strategy, Delete the Dead Path

**Root cause:** In `getTasks` (lines 1038–1060 in `get-tasks.ts`), there are two branches:
```ts
if (providedUserId) {
    res = await _getTasksInternal(...);
} else {
    res = await unstable_cache(() => _getTasksInternal(...), [cacheKey], { tags, revalidate: 30 })();
}
```
Based on the conversation history, the migration to a "Zero-Weight" architecture means **`providedUserId` is always passed** from Server Components, and `unstable_cache` is bypassed 100% of the time in practice. This dead branch adds ~3 seconds of overhead locally if it were ever hit.

**Fix:** Always call `_getTasksInternal` directly. Delete the `unstable_cache` branch and remove the dead code.

> [!IMPORTANT]
> Before deleting the `unstable_cache` path, verify no page or layout in the `app/` directory calls `getWorkspaceTasks` **without** a second argument (i.e., without `user.id`). If any call site is missing it, add it before removing the cache branch.

#### [MODIFY] [get-tasks.ts](file:///c:/VamsiKrishna/Github/Tusker-managment/src/data/task/get-tasks.ts)
- Collapse the `if (providedUserId) { ... } else { ... }` block into a single direct call.
- Remove the `buildQuerySignature`, `cacheKey`, and `tags` variables since they only served the dead cache branch.
- Remove the `unstable_cache` import if no longer needed elsewhere.

---

## Verification Plan

### Automated Tests
- Run `pnpm run build` — must produce zero TypeScript errors after removing `view_mode` from opts.

### Manual Verification
- Reload the Gantt view and confirm parent tasks and subtasks render.
- Use the List view with an assignee filter to confirm access control scoping still works for restricted members.
- Use the Kanban view with multi-status filter to confirm groupBy still returns correct counts.
- Check Network tab to confirm payload size is unchanged (these are query logic changes only, not select changes).
