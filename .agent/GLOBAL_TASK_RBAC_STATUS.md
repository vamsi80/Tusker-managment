# Global Task View RBAC Implementation

## ✅ Completed Feature

### 1. **"Add Task" Button Visibility (Fixed)**
- Hidden for users without `canCreateSubTask` permission
- **Fixed:** Updated `getWorkspacePermissions` to include `PROJECT_MANAGER` role in `hasAccess` check.
- **Result:** Project Managers can now see the "Add Task" button in the global view.

### 2. **Backend Permission Validation**
- All task edit/delete server actions check permissions
- **PROJECT_MANAGER** -> Can edit/delete tasks in their projects
- **LEAD** -> Can edit/delete ONLY tasks they created
- **ADMIN** -> Can edit/delete ALL tasks

### 3. **Smart UI Button Visibility (Fixed & Verified)**
Edit and Delete buttons are now conditionally shown/hidden based on permissions.
- **Fixed:** Included `canManageMembers` in `projects` data passed to table, enabling Project Managers to access edit/delete buttons their projects globally.

### 4. **"Add Subtask" Button Visibility (Fixed)**
- **Fixed:** logic in `TaskTable` to allow `PROJECT_MANAGER` to create subtasks in the global view.

### 5. **Create Task - Project Selection (Fixed)**
- **Fixed:** `InlineTaskForm` in global view now allows Project Managers to select their managed projects.

### 6. **Data Visibility / Read Permissions (CRITICAL FIX)**
- **Issue:** Previously, being a Project Manager in *one* project might have incorrectly granted "See All Tasks" access to *other* projects where the user was only a member (in List/Kanban views).
- **Fix:** Implemented efficient **Hybrid Access Logic** in both List and Kanban data fetchers.
- **Logic:**
  ```sql
  WHERE projectId IN (AuthorizedProjects)
  AND (
      projectId IN (ManagedProjectIds)  -- Full Access Projects
      OR 
      assignee = CurrentUser            -- Member Only Projects
  )
  ```
- **Result:** Project Managers see **ALL** tasks in their managed projects, but **ONLY** assigned tasks in other projects.

---

## Permission Matrix

| Role | Scope | Create Task | Create Subtask | Edit Task/Subtask | Delete Task/Subtask | View Tasks (List/Kanban) |
|------|-------|-------------|----------------|-------------------|---------------------|--------------------------|
| **ADMIN** | Workspace | ✅ | ✅ | ✅ | ✅ | **See All** |
| **PROJECT_MANAGER** | Their Project | ✅ | ✅ | ✅ | ✅ | **See All** |
| **LEAD** | Their Project | ✅ | ✅ | Own Only | Own Only | **See All** |
| **MEMBER** | Their Project | ❌ | ❌ | ❌ | ❌ | **Assigned Only** |
| **VIEWER** | Their Project | ❌ | ❌ | ❌ | ❌ | **Assigned Only** |

*Note: A user can separate roles in different projects. The system correctly isolates permissions per project.*
