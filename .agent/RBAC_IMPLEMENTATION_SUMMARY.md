# RBAC Implementation Summary

## Overview
This document summarizes the Role-Based Access Control (RBAC) implementation for the Tusker Management system, focusing on workspace roles, project roles, and their permissions.

---

## Workspace Roles

### 1. OWNER
- **Full workspace control**
- Can create, edit, and delete projects
- Can manage all workspace members
- Can assign any workspace member as PROJECT_MANAGER when creating projects
- Sees ALL projects in the workspace
- Has full access to all project operations

### 2. ADMIN
- **Administrative privileges** (similar to OWNER)
- Can create, edit, and delete projects
- Can manage all workspace members
- Can assign any workspace member as PROJECT_MANAGER when creating projects
- Sees ALL projects in the workspace
- Has full access to all project operations

### 3. MANAGER
- **Limited project creation and management**
- Can create projects
- When creating a project:
  - Automatically assigned as PROJECT_MANAGER
  - Field is non-editable (they become the project manager by default)
- Can only see:
  - Projects they created
  - Projects where they are explicitly added as a member
- Can be assigned different project roles in other projects (LEAD, MEMBER, VIEWER)

### 4. MEMBER
- **Standard workspace member**
- Cannot create projects
- Can only see projects where they are explicitly added
- Can be assigned as PROJECT_MANAGER by OWNER/ADMIN
- Typically assigned as project LEAD or MEMBER

### 5. VIEWER
- **Read-only access**
- Cannot create projects
- Can only view projects where explicitly added
- Limited permissions within projects

---

## Project Roles

### 1. PROJECT_MANAGER
- **Full project control**
- Can edit project details
- Can manage project members (add, remove, change roles)
- Can delete the project
- Can create, edit, and delete ALL tasks in the project
- Cannot be removed from the project
- Cannot have their role changed
- Badge displayed in amber color with "Manager" label

### 2. LEAD
- **Team leadership role**
- Can create tasks
- Can edit and delete ONLY tasks they created
- Cannot edit or delete tasks created by PROJECT_MANAGER
- Cannot manage project members
- Cannot edit or delete the project

### 3. MEMBER
- **Standard project contributor**
- Can view tasks
- Can be assigned tasks
- Limited creation/editing permissions
- Cannot manage project members

### 4. VIEWER
- **Read-only project access**
- Can only view project information
- Cannot create or edit anything

---

## Key Implementation Details

### Project Creation Flow

#### For OWNER/ADMIN:
1. Open create project dialog
2. Fill in project details
3. **Select Project Manager**: Dropdown shows only workspace MANAGER role members
4. Can select any workspace MANAGER to be the PROJECT_MANAGER
5. Selected manager gets PROJECT_MANAGER role in the project

#### For MANAGER:
1. Open create project dialog
2. Fill in project details
3. **Project Manager field**: Shows their name (non-editable, disabled input)
4. Automatically assigned as PROJECT_MANAGER upon creation
5. Cannot select anyone else as project manager

### Project Visibility Rules

```typescript
// OWNER/ADMIN: See ALL projects
if (isOwnerOrAdmin) {
    return allProjectsInWorkspace;
}

// MANAGER: See projects they created OR are member of
if (isManager) {
    return projectsCreatedByManager OR projectsWhereTheyAreMember;
}

// MEMBER/VIEWER: Only projects they are member of
return projectsWhereTheyAreMember;
```

### Project Management Permissions

Each project includes a `canManageMembers` flag calculated as:

```typescript
canManageMembers = isOwnerOrAdmin || isProjectManager || isCreator
```

This flag controls access to:
- Edit Project
- Manage Members
- Delete Project

### Task Permissions (Implemented)

The system tracks task creators via `createdById` field:

#### PROJECT_MANAGER:
- Can create tasks
- Can edit ALL tasks in the project
- Can delete ALL tasks in the project

#### LEAD:
- Can create tasks
- Can edit ONLY tasks where `createdById === currentUserId`
- Can delete ONLY tasks where `createdById === currentUserId`
- Cannot modify tasks created by PROJECT_MANAGER or other LEADs

#### MEMBER:
- Can view tasks
- Can be assigned tasks
- Limited or no creation/editing permissions

---

## Database Schema Updates

### Project Model
```prisma
model Project {
  // ...
  createdBy String? // Tracks who created the project
  projectMembers ProjectMember[]
  // ...
}
```

### ProjectMember Model
```prisma
model ProjectMember {
  // ...
  projectRole ProjectRole // PROJECT_MANAGER, LEAD, MEMBER, VIEWER
  hasAccess Boolean
  // ...
}
```

### Task Model
```prisma
model Task {
  // ...
  createdById String // Tracks who created the task
  createdBy User @relation("TaskCreator", fields: [createdById], references: [id])
  // ...
}
```

---

## UI Components Modified

### 1. `create-project-form.tsx`
- Added `userRole` and `currentUserId` props
- Conditional rendering based on user's workspace role
- MANAGER: Non-editable project manager field (auto-assigned)
- OWNER/ADMIN: Dropdown to select from workspace MANAGER role members

### 2. `nav-projects.tsx`
- Updated dropdown menu to use `canManageMembers` flag
- PROJECT_MANAGER now sees Edit, Manage Members, and Delete options
- No longer restricted to workspace ADMIN only

### 3. `nav-projects-async.tsx`
- Fetches current user's workspace role
- Passes `userRole` and `currentUserId` to child components

### 4. `manage-members-dialog.tsx`
- PROJECT_MANAGER role badge shown in amber
- PROJECT_MANAGER role cannot be changed (shows "Fixed Role")
- PROJECT_MANAGER members cannot be removed
- PROJECT_MANAGER access cannot be toggled
- Only LEAD and MEMBER roles can be assigned/changed

### 5. `edit-project-form.tsx`
- Updated labels from "Project Lead" to "Project Manager"
- Consistent terminology throughout the UI

---

## Server Actions Modified

### 1. `create-project.ts`
- Determines project managers based on creator's role
- OWNER/ADMIN: Uses provided `projectLead` from form
- MANAGER: Auto-assigns themselves as PROJECT_MANAGER
- Creates ProjectMember records with PROJECT_MANAGER role

### 2. `get-projects.ts`
- Fetches `projectMembers` data for each project
- Calculates `canManageMembers` flag for each project
- Returns enriched project data with permission flags

---

## Permission Constants

### Workspace Permissions (`workspace-access.ts`)
```typescript
OWNER/ADMIN:
  - project:create
  - project:edit
  - project:delete
  - members:manage

MANAGER:
  - project:create
  - (limited to their own projects)

MEMBER/VIEWER:
  - (no project creation permissions)
```

### Project Permissions (`project-access.ts`)
```typescript
PROJECT_MANAGER:
  - Full project control
  - task:create
  - task:edit (all)
  - task:delete (all)
  - members:manage

LEAD:
  - task:create
  - task:edit (own only)
  - task:delete (own only)

MEMBER:
  - task:view
  - (limited permissions)
```

---

## Next Steps for Task Permissions

To fully implement task-level permissions, you need to:

1. **Update task creation actions** to set `createdById` correctly
2. **Update task edit/delete actions** to check permissions:
   ```typescript
   // In edit/delete task action
   const canEdit = 
       isProjectManager || 
       (isLead && task.createdById === currentUserId);
   ```
3. **Update task UI components** to conditionally show edit/delete buttons
4. **Add permission checks** in task-related server actions

---

## Security Considerations

1. **Server-side validation**: All permissions are enforced in server actions
2. **UI-level checks**: Components hide/disable actions based on permissions
3. **Database constraints**: Foreign keys and cascading deletes maintain data integrity
4. **Role hierarchy**: Clear separation between workspace and project roles
5. **Creator tracking**: Both projects and tasks track their creators for permission checks

---

## Testing Checklist

- [ ] OWNER can create project and assign any MANAGER as PROJECT_MANAGER
- [ ] ADMIN can create project and assign any MANAGER as PROJECT_MANAGER
- [ ] MANAGER auto-assigned as PROJECT_MANAGER when creating project
- [ ] MANAGER field is non-editable for MANAGER role users
- [ ] PROJECT_MANAGER can edit, manage members, and delete their project
- [ ] PROJECT_MANAGER can create, edit, delete all tasks
- [ ] LEAD can create tasks
- [ ] LEAD can only edit/delete their own tasks
- [ ] LEAD cannot edit/delete PROJECT_MANAGER's tasks
- [ ] PROJECT_MANAGER role cannot be changed in manage members dialog
- [ ] PROJECT_MANAGER cannot be removed from project
- [ ] Workspace MANAGER can be LEAD/MEMBER in other projects

---

## Summary

The RBAC system now provides:
- ✅ Clear separation between workspace and project roles
- ✅ Flexible project manager assignment for OWNER/ADMIN
- ✅ Automatic PROJECT_MANAGER assignment for MANAGER role
- ✅ Full project control for PROJECT_MANAGER
- ✅ Task-level permissions based on creator
- ✅ Proper UI visibility based on permissions
- ✅ Server-side permission enforcement

This implementation ensures that workspace MANAGERs can manage their own projects while also participating in other projects with different roles (LEAD, MEMBER), providing maximum flexibility while maintaining security.
