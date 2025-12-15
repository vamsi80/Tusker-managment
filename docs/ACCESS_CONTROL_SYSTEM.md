# Access Control System Documentation

## Overview

The Tusker Management system implements a comprehensive role-based access control (RBAC) system with two levels:
1. **Workspace Level** - Controls access across the entire workspace
2. **Project Level** - Controls access to specific projects within a workspace

## Workspace Roles

### Role Hierarchy (Highest to Lowest)

#### 1. OWNER
- **Full workspace control**
- **Cannot be removed** (must transfer ownership first)
- **Only one owner per workspace**
- Automatically has admin-level access to ALL projects
- Can transfer ownership to another member
- Can delete the workspace
- Can manage all members including admins

**Permissions:**
- ✅ Delete workspace
- ✅ Update workspace settings
- ✅ Transfer ownership
- ✅ Manage all members (including admins)
- ✅ Invite members
- ✅ Remove members (except self)
- ✅ Update member roles (including promoting to admin)
- ✅ Create, update, delete ALL projects
- ✅ Manage members in ALL projects
- ✅ Full access to ALL projects

#### 2. ADMIN
- **Workspace administrator**
- Can manage workspace and projects
- **Cannot** delete workspace or transfer ownership
- **Cannot** manage other admins or the owner
- Automatically has admin-level access to ALL projects

**Permissions:**
- ❌ Delete workspace
- ✅ Update workspace settings
- ❌ Transfer ownership
- ✅ Manage members (MEMBER and VIEWER only)
- ✅ Invite members
- ✅ Remove members (MEMBER and VIEWER only)
- ✅ Update member roles (to MEMBER or VIEWER only)
- ✅ Create, update, delete ALL projects
- ✅ Manage members in ALL projects
- ✅ Full access to ALL projects

#### 3. MEMBER
- **Standard workspace member**
- Can access assigned projects
- Can create and manage tasks in assigned projects
- **Cannot** create projects (only OWNER/ADMIN can)

**Permissions:**
- ❌ Workspace management
- ❌ Create projects
- ✅ Access assigned projects
- ✅ Create tasks in assigned projects
- ✅ Manage own tasks

#### 4. VIEWER
- **Read-only workspace member**
- Can view assigned projects
- Cannot create or modify anything

**Permissions:**
- ❌ All management operations
- ✅ View assigned projects (read-only)

## Project Roles

### Role Hierarchy (Highest to Lowest)

#### 1. LEAD
- **Project administrator**
- Can manage project settings and members
- Can manage all tasks
- **Note:** Workspace OWNER/ADMIN have same permissions

**Permissions:**
- ✅ Update project settings
- ✅ Manage project members
- ✅ Add/remove members
- ✅ Update member roles
- ✅ Create, update, delete ANY task
- ✅ Assign tasks to anyone
- ✅ Manage all comments

#### 2. MEMBER
- **Standard project member**
- Can create and manage tasks
- Can manage own tasks and assigned tasks

**Permissions:**
- ❌ Project management
- ✅ Create tasks
- ✅ Update own tasks
- ✅ Update assigned tasks
- ✅ Create comments
- ✅ View all tasks

#### 3. VIEWER
- **Read-only project member**
- Can only view project data

**Permissions:**
- ❌ All management operations
- ✅ View all tasks (read-only)

## Override Rules

### Workspace OWNER and ADMIN Override

**Key Principle:** Workspace OWNER and ADMIN automatically have admin-level access to ALL projects in their workspace, regardless of project membership.

```typescript
// Example: Checking project admin access
function isProjectAdmin(projectRole, workspaceRole) {
    // Workspace OWNER/ADMIN are always project admins
    if (workspaceRole === "OWNER" || workspaceRole === "ADMIN") {
        return true;
    }
    
    // Otherwise, check if user is project LEAD
    return projectRole === "LEAD";
}
```

### What This Means:

1. **Workspace OWNER/ADMIN don't need to be added as project members**
   - They have automatic access to all projects
   - They won't appear in project member lists
   - They can't be added through "Manage Members" dialog

2. **Workspace OWNER/ADMIN can manage any project**
   - Edit project settings
   - Add/remove project members
   - Update member roles
   - Delete projects

3. **Workspace OWNER/ADMIN can manage any task**
   - Create, update, delete any task
   - Assign tasks to anyone
   - Change task status

## Permission Checking

### Using Workspace Access Control

```typescript
import { hasWorkspacePermission, isWorkspaceAdmin } from "@/lib/workspace-access";

// Check specific permission
if (hasWorkspacePermission(userRole, "project:create")) {
    // User can create projects
}

// Check if user is admin-level
if (isWorkspaceAdmin(userRole)) {
    // User is OWNER or ADMIN
}
```

### Using Project Access Control

```typescript
import { hasProjectPermission, isProjectAdmin } from "@/lib/project-access";

// Check specific permission (with workspace override)
if (hasProjectPermission(projectRole, workspaceRole, "task:create")) {
    // User can create tasks
}

// Check if user is project admin (with workspace override)
if (isProjectAdmin(projectRole, workspaceRole)) {
    // User is workspace OWNER/ADMIN or project LEAD
}
```

## Role Management Rules

### Workspace Role Management

| Manager Role | Can Manage | Can Assign Roles |
|--------------|------------|------------------|
| OWNER | Everyone | ADMIN, MEMBER, VIEWER |
| ADMIN | MEMBER, VIEWER | MEMBER, VIEWER |
| MEMBER | None | None |
| VIEWER | None | None |

**Special Rules:**
- OWNER cannot be removed (must transfer ownership first)
- ADMIN cannot manage other ADMINs or OWNER
- ADMIN cannot promote members to ADMIN (only OWNER can)
- Cannot remove yourself if you're the last OWNER

### Project Role Management

| Manager Role (Workspace) | Manager Role (Project) | Can Manage | Can Assign Roles |
|--------------------------|------------------------|------------|------------------|
| OWNER/ADMIN | Any | Everyone | LEAD, MEMBER, VIEWER |
| MEMBER/VIEWER | LEAD | MEMBER, VIEWER | MEMBER, VIEWER |
| MEMBER/VIEWER | MEMBER/VIEWER | None | None |

**Special Rules:**
- Workspace OWNER/ADMIN can manage anyone in projects
- Project LEAD can manage MEMBER and VIEWER
- Cannot manage workspace OWNER/ADMIN through project interface

## Implementation Files

### Core Access Control
- `src/lib/workspace-access.ts` - Workspace permission system
- `src/lib/project-access.ts` - Project permission system
- `src/app/data/project/check-project-admin.ts` - Project admin checking helper

### Server Actions
- `src/actions/project/create-project.ts` - Project creation (OWNER/ADMIN only)
- `src/actions/project/update-project.ts` - Project editing (OWNER/ADMIN/LEAD)
- `src/actions/project/delete-project.ts` - Project deletion (OWNER/ADMIN only)
- `src/actions/project/manage-members.ts` - Member management (OWNER/ADMIN/LEAD)

### UI Components
- `src/app/w/_components/sidebar/manage-members-dialog.tsx` - Member management UI
- `src/app/w/[workspaceId]/p/_components/create-project-form.tsx` - Project creation form
- `src/app/w/_components/sidebar/edit-project-form.tsx` - Project editing form

## Database Schema

### WorkspaceMember
```prisma
model WorkspaceMember {
  workspaceRole  WorkspaceRole   @default(MEMBER)
  // ... other fields
  
  @@index([workspaceId, workspaceRole])
}

enum WorkspaceRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}
```

### ProjectMember
```prisma
model ProjectMember {
  projectRole ProjectRole @default(MEMBER)
  hasAccess   Boolean     @default(false)
  // ... other fields
  
  @@index([projectId, projectRole])
}

enum ProjectRole {
  LEAD
  MEMBER
  VIEWER
}
```

## Best Practices

1. **Always check workspace role first** for workspace-level operations
2. **Use helper functions** for permission checking (don't hardcode role checks)
3. **Remember the override rule** - OWNER/ADMIN always have project access
4. **Validate on server-side** - never trust client-side permission checks
5. **Use proper error messages** that explain required permissions
6. **Audit log all permission-sensitive actions**
7. **Test with different role combinations** to ensure override logic works

## Migration Notes

If you're upgrading from a system without the OWNER role:

1. **Run database migration** to add OWNER to WorkspaceRole enum
2. **Update existing workspaces** to set the owner field
3. **Promote workspace owners** from ADMIN to OWNER role
4. **Update all permission checks** to include OWNER
5. **Test thoroughly** with OWNER, ADMIN, and other roles

## Security Considerations

1. **Ownership transfer** must be explicit and confirmed
2. **Cannot delete workspace** with active projects (implement safeguards)
3. **Audit log all role changes** for accountability
4. **Prevent privilege escalation** - users cannot promote themselves
5. **Workspace OWNER is powerful** - choose wisely
6. **Regular permission audits** to ensure correct access levels
