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

**Logic Used:**
- **For Project View:**
  ```typescript
  canEdit = isWorkspaceAdmin || isProjectManager || (isLead && task.createdById === userId)
  ```
- **For Global Workspace View:**
  - Check `projects` array to find task's project
  - If `project.canManageMembers` is true -> Allow Edit/Delete (Covers PROJECT_MANAGER & CREATOR)
    - *Fix Applied:* Included `canManageMembers` in `projects` data passed to table.
  - If user is LEAD and `task.createdById === userId` -> Allow Edit/Delete
  - Otherwise -> Hide buttons

### 4. **"Add Subtask" Button Visibility (Fixed)**
- **Fixed:** logic in `TaskTable` to allow `PROJECT_MANAGER` to create subtasks in the global view.
- Logic now checks:
  ```typescript
  allow = leadProjectIds.includes(taskId) || isWorkspaceAdmin || project.canManageMembers
  ```

### 5. **Create Task - Project Selection (Fixed)**
- **Fixed:** `InlineTaskForm` in global view now allows Project Managers to select their managed projects.
- Previous logic only allowed Admins or Leads.
- New logic:
  ```typescript
  projects.filter(p => p.canManageMembers || leadProjectIds.includes(p.id))
  ```

---

## Permission Matrix

| Role | Scope | Create Task | Create Subtask | Edit Task/Subtask | Delete Task/Subtask | Verified |
|------|-------|-------------|----------------|-------------------|---------------------|----------|
| **ADMIN** | Workspace | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PROJECT_MANAGER** | Their Project | ✅ | ✅ | ✅ | ✅ | ✅ |
| **LEAD** | Their Project | ✅ | ✅ | Own Only | Own Only | ✅ |
| **MEMBER** | Any | ❌ | ❌ | ❌ | ❌ | ✅ |
| **VIEWER** | Any | ❌ | ❌ | ❌ | ❌ | ✅ |
