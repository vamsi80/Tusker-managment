# Task Role-Based Access Control (RBAC) Implementation Guide

## Overview
This document outlines the implementation of RBAC for Task Management, ensuring strict data visibility and action permissions based on user roles (`PROJECT_MANAGER`, `LEAD`, `MEMBER`).

## 1. Role Definitions & Permissions

| Role | Scope | View Permission | Edit Permission | Delete Permission | Create Task |
|------|-------|-----------------|-----------------|-------------------|-------------|
| **ADMIN** | Workspace | **ALL Tasks** | **ALL** | **ALL** | ✅ |
| **PROJECT_MANAGER** | Managed Project | **ALL Tasks** | **ALL** in Project | **ALL** in Project | ✅ |
| **LEAD** | Project | **ALL Tasks** | **Own Tasks Only** | **Own Tasks Only** | ✅ |
| **MEMBER / VIEWER** | Project | **Assigned Only** | **Own/Assigned Only** | **Own Only** | ❌ (Configurable) |

*> Note: "Own Tasks" = Tasks created by the user.*
*> Note: "Assigned Only" = Tasks where `assigneeTo` matches `userId`.*

---

## 2. Implementation Details

### A. Data Visibility (The "See All" vs "See Mine" Logic)

**Global List View (`get-workspace-tasks.ts`) & Kanban (`get-subtasks-by-status.ts`)**
We implemented **Hybrid Access Logic** to handle users with mixed roles (e.g., Manager in Project A, Member in Project B).

```typescript
// Logic Concept:
WHERE
  (projectId IN [AuthorizedProjects]) // Basic security
  AND
  (
     projectId IN [ManagedProjectIds]  // Case 1: Manager/Lead -> See ALL
     OR
     assigneeTo = [CurrentUserId]      // Case 2: Member -> See MINE only
  )
```

**Key Fixes:**
1.  **Strict Membership Check:** Updated `isMember` logic in `get-user-permissions.ts` to strictly exclude privileged roles (`!Admin && !PM && !Lead`). This prevents "Workspace Managers" from accidentally seeing all tasks in projects where they should be restricted.
2.  **Kanban Fix:** Replaced binary `isProjectLead` flag with `fullAccessProjectIds` array to support the Hybrid Access Logic in Kanban boards.

### B. Action Permissions (Edit/Delete/Create)

**UI Visibility (`TaskRow`, `TaskTable`)**
- `Edit`/`Delete` buttons are conditionally rendered.
- `PROJECT_MANAGER` sees buttons for all tasks in their project.
- `LEAD` sees buttons only for tasks they created.
- `MEMBER` sees buttons only for tasks they created/assigned (depending on specific rule).

**Backend Validation (Server Actions)**
- **`update-task.ts` / `delete-task.ts`**:
    - Verifies `isProjectManager` for the specific project.
    - Allows operation if User is Manager OR (User is Creator AND Lead).
    - Blocks unauthorized attempts.

### C. Member Categories ("Separate Members")

The system distinguishes between "Privileged Members" and "Regular Members":
1.  **Privileged (Managers/Leads):** Handled via `fullAccessProjectIds`. They get broad access.
2.  **Separate/Regular Members:** Handled via the fallback `assigneeTo = userId` clause.
    - This ensures that even if a user exists in the project, if they are not a Manager/Lead, they **cannot** see other people's tasks.

---

## 3. Testing Checklist

- [x] **Project Manager** sees ALL tasks in their own project.
- [x] **Project Manager** sees ONLY assigned tasks in *other* projects.
- [x] **Lead** sees ALL tasks in their project.
- [x] **Member** sees ONLY assigned tasks.
- [x] **Workspace Manager** (who is just a Member in a project) sees ONLY assigned tasks in that project.
- [x] **Kanban Board** correctly shows "Project Manager" instead of "Lead" on cards.
- [x] **Edit/Delete Actions** blocked for unauthorized users even if UI is bypassed.

## 4. Troubleshooting

**Issue:** User sees tasks from all projects?
- **Fix:** Check `fullAccessProjectIds`. Ensure it only contains projects where `role == MANAGER` or `LEAD`.
- **Fix:** Check `isMember` logic. It must be `False` for Managers.

**Issue:** User cannot see "Add Subtask"?
- **Fix:** Check `canCreateSubTask` in `get-user-permissions`. Must include `isProjectManager`.
