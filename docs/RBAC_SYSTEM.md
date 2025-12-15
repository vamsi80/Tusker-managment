# Role-Based Access Control (RBAC) System

## Overview

The Tusker Management application implements a hierarchical role-based access control system with two levels:
1. **Workspace Level** - Controls access across the entire workspace
2. **Project Level** - Controls access to specific projects within a workspace

## Workspace Roles

Defined in `WorkspaceRole` enum:

### ADMIN
- **Full workspace control**
- Can create, edit, and delete projects
- Can invite and remove workspace members
- **Automatically has admin-level access to ALL projects** in the workspace
- Can manage project members across all projects
- Can perform all actions that MEMBER and VIEWER roles can do

### MEMBER
- Can be assigned to projects
- Can view projects they're assigned to
- Can create and manage tasks in assigned projects
- Cannot create new projects (only workspace admins can)
- Cannot manage workspace members

### VIEWER
- Read-only access to assigned projects
- Cannot create or modify tasks
- Cannot manage project members

## Project Roles

Defined in `ProjectRole` enum:

### LEAD
- **Project-level admin access**
- Can edit project details
- Can add/remove project members
- Can update member roles within the project
- Can toggle member access
- Full control over project tasks and settings

### MEMBER
- Can create and manage tasks
- Can view all project data
- Cannot manage project members
- Cannot edit project settings

### VIEWER
- Read-only access to project
- Can view tasks and project data
- Cannot create or modify anything

## Admin-Level Access

Admin-level access to a project is granted to users who are **EITHER**:
1. **Workspace ADMIN** - Automatically have admin access to ALL projects in their workspace
2. **Project LEAD** - Have admin access to their specific project(s)

This is implemented in `src/app/data/project/check-project-admin.ts`:

```typescript
// User has admin access if they are either workspace admin OR project lead
const isAdmin = isWorkspaceAdmin || isProjectLead;
```

## Key Implementation Details

### Workspace Admin Privileges

Workspace admins have special privileges:

1. **Automatic Project Access**: Don't need to be explicitly added as project members
2. **Override Project Permissions**: Can manage any project in their workspace
3. **Member Management**: Can add/remove members from any project
4. **Project Creation**: Only workspace admins can create new projects

### Permission Checks

Use the helper functions in `src/app/data/project/check-project-admin.ts`:

```typescript
// Check if user has admin access
const access = await checkProjectAdminAccess(projectId);
if (!access.isAdmin) {
    // User doesn't have admin access
}

// Or require admin access (throws error if not admin)
const { user, project } = await requireProjectAdmin(projectId);
```

### Server Actions

All project management actions check for admin access:

- `create-project.ts` - Only workspace admins
- `update-project.ts` - Workspace admins OR project leads
- `delete-project.ts` - Only workspace admins
- `manage-members.ts` - Workspace admins OR project leads

## Database Schema

### WorkspaceMember
```prisma
model WorkspaceMember {
  workspaceRole  WorkspaceRole   @default(MEMBER)
  // ... other fields
}
```

### ProjectMember
```prisma
model ProjectMember {
  projectRole ProjectRole @default(MEMBER)
  hasAccess   Boolean     @default(false)
  // ... other fields
}
```

## Usage Examples

### Creating a Project
```typescript
// Only workspace admins can create projects
const isUserAdmin = currentMemberRecord.workspaceRole === "ADMIN";
if (!isUserAdmin) {
    return { status: "error", message: "Only workspace admins can create projects." };
}
```

### Editing a Project
```typescript
// Workspace admins OR project leads can edit
const access = await checkProjectAdminAccess(projectId);
if (!access.isAdmin) {
    return { status: "error", message: "Only workspace admins and project leads can edit projects." };
}
```

### Managing Project Members
```typescript
// Workspace admins OR project leads can manage members
const isWorkspaceAdmin = workspaceMember.workspaceRole === "ADMIN";
const isProjectLead = projectMember?.projectRole === "LEAD";

if (!isWorkspaceAdmin && !isProjectLead) {
    return { status: "error", message: "Only workspace admins and project leads can manage members." };
}
```

## Best Practices

1. **Always check workspace role first** for workspace-level operations
2. **Use helper functions** (`checkProjectAdminAccess`, `requireProjectAdmin`) for consistency
3. **Include proper error messages** that explain the required role
4. **Audit log all permission-sensitive actions**
5. **Never trust client-side role checks** - always verify on the server

## Security Considerations

1. All permission checks are done server-side using `"use server"` or `"server-only"`
2. User authentication is required before any permission check (`requireUser()`)
3. Database queries filter by user ID to prevent unauthorized access
4. Workspace admins cannot be removed if they're the last admin
5. Workspace owners cannot be removed (must transfer ownership first)
