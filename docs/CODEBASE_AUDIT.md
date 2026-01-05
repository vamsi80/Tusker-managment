# 🕵️ Tusker Management Codebase Deep Audit

This document provides a line-by-line depth analysis of the codebase, identifying dead code, duplication, critical missing features, and security vulnerabilities.

**Date:** January 05, 2026
**Status:** 🔴 Critical Action Items Found

---

## 1. 🗑️ Dead & Unused Code
The following files and functions are **never imported or used** in the application and should be deleted immediately to reduce maintenance burden.

| File / Function | Location | Reason | Action |
| :--- | :--- | :--- | :--- |
| `getProjectTasks` | `src/data/task/list/get-tasks.ts` | **Zero imports**. It has been superseded by `getParentTasksOnly` (Optimized) + `getSubTasks` (Lazy Load). | **DELETE FILE** |
| `firebase-clint.ts` | `src/lib/firebase-clint.ts` | **Misleading Name**. It exports an AWS `S3Client`, nothing to do with Firebase. | **RENAME** to `s3-client.ts` |
| `auth-clint.ts` | `src/lib/auth-clint.ts` | **Typo**. Should be `auth-client.ts`. | **RENAME** |
| `use-constract-url.ts` | `src/hooks/use-constract-url.ts` | **Typo**. Should be `use-construct-url.ts`. | **RENAME** |
| `verifyRequestclinte.tsx` | `src/app/(auth)/verify-request/_components` | **Typo**. Should be `verifyRequestClient.tsx`. | **RENAME** |

---

## 2. 👯 Duplicated Logic
Code that performs the same business logic in multiple places, leading to inconsistent behavior and bugs.

### A. Task Fetching Logic
- **Conflict**: `get-tasks.ts` vs `get-parent-tasks-only.ts`.
- **Analysis**: Both define `_getProjectTasksInternal` logic. If you update the "Who can see what" logic in one, the other breaks.
- **Fix**: Consolidate into a single `get-tasks-query-builder.ts` that handles the `where` clause generation, and let specific files just specify the `select` and `take`.

### B. Workspace Permissions
- **Conflict**: `get-user-permissions.ts` vs `create-subTask.ts` (inline checks).
- **Analysis**: Server actions often re-implement "is user a member" checks manually instead of using the centralized `getUserPermissions`.
- **Fix**: Enforce usage of `await requireWorkspaceMember(workspaceId)` guard clause in ALL server actions.

---

## 3. 🚨 Critical Missing Features (The "Top 1%" Gap)

### A. Optimistic Concurrency Control (OCC) - **CRITICAL**
*   **The Problem**: User A opens a task. User B opens the same task. User A changes description. User B changes status. User B saves. **User A's description change is blown away** because User B's save overwrites the whole record (or specific fields based on stale state).
*   **The Fix**: Add `@version` to `Task` model. All updates MUST send `version`. If DB version != Client version, throw "Stale Data" error.

### B. Rate Limiting (DDoS Protection)
*   **The Problem**: `middleware.ts` exists but does **not** use the `@arcjet/next` library present in `package.json`.
*   **The Risk**: A script can hit `/api/register-invite` 10,000 times/sec to spam emails.
*   **The Fix**: Implement Arcjet sliding window rate limit in `middleware.ts`.

### C. End-to-End (E2E) Testing
*   **The Problem**: No `cypress` or `playwright` folder.
*   **The Risk**: You are coding "blind". You rely on manual clicking to verify features. As the app grows, you *will* break old features (Regressions).
*   **The Fix**: Install Playwright and add `tests/e2e/task-crud.spec.ts`.

### D. Centralized Error Handling
*   **The Problem**: Every Server Action has its own `try/catch` and generic string error.
*   **The Fix**: Create `src/lib/safe-action.ts` wrapper.
    ```typescript
    export const safeAction = createSafeAction(zodSchema, async (data, user) => { ... })
    ```
    This automatically handles Zod validation errors, Auth checks, and DB errors standardly.

---

## 4. ⚠️ Security Vulnerabilities

### A. Middleware Session Fetching (Performance & Point-of-Failure)
*   **Code**: `fetch('/api/auth/get-session')` inside `middleware.ts`.
*   **Issue**: This creates an internal HTTP request for **every single page load**. It doubles your server load and adds latency.
*   **Fix**: Use `better-auth`'s stateless JWT verification if possible, or query Redis/DB directly in middleware (if using Edge-compatible driver). **Do not fetch your own API.**

### B. Missing Transactional Writes
*   **Code**: `create-subTask.ts`.
*   **Issue**: You check permissions -> `await`. Then you create task -> `await`.
*   **Exploit**: A user is kicked from the workspace. In the 100ms window between checking permissions and creating the task, they can still create the task.
*   **Fix**: Use `prisma.$transaction`.

---

## 5. 🛠️ Refactoring Roadmap

### Phase 1: Cleanup (Immediate)
1.  [] Delete `src/data/task/list/get-tasks.ts`.
2.  [] Rename `firebase-clint.ts` -> `s3-client.ts`.
3.  [] Rename `auth-clint.ts` -> `auth-client.ts`.
4.  [] Rename `use-constract-url.ts` -> `use-construct-url.ts` and update imports.

### Phase 2: Reliability (Next 2 Days)
1.  [] Add `version` Int field to `Task` schema.
2.  [] Update `update-task.ts` and `update-subTask.ts` to check `version`.
3.  [] Implement Arcjet in `middleware.ts`.

### Phase 3: Structure (Next Week)
1.  [] Implement `safeAction` wrapper to remove try/catch boilerplate.
2.  [] Set up Playwright for E2E testing.

---

**Generated by Antigravity Agent**
