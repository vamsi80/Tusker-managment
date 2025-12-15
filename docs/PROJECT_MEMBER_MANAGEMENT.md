# Project Member Management - Implementation Guide

This guide explains how to use the project member management actions and components.

## Overview

The project member management system allows workspace admins and project leads to:
- Add members to a project
- Remove members from a project
- Update member roles (LEAD, MEMBER, VIEWER)
- Toggle member access (enable/disable)

## Files Created

### 1. Server Actions (`src/actions/project/manage-members.ts`)

Contains four server actions:

#### `addProjectMembers(projectId: string, memberUserIds: string[])`
- Adds new members to a project
- Only workspace admins and project leads can add members
- Automatically assigns "MEMBER" role to new members
- Returns success/error response

#### `removeProjectMembers(projectId: string, memberUserIds: string[])`
- Removes members from a project
- Only workspace admins and project leads can remove members
- Prevents removing the last project lead
- Returns success/error response

#### `updateProjectMemberRole(projectId: string, memberUserId: string, newRole: ProjectRole)`
- Updates a member's role (LEAD, MEMBER, or VIEWER)
- Only workspace admins and project leads can update roles
- Prevents demoting the last project lead
- Returns success/error response

#### `toggleProjectMemberAccess(projectId: string, memberUserId: string)`
- Toggles a member's access (enable/disable)
- Only workspace admins and project leads can toggle access
- Returns success/error response

### 2. UI Components

#### `ManageProjectMembersDialog` (`src/app/w/_components/sidebar/manage-members-dialog.tsx`)
- Full-featured dialog for managing project members
- Shows current members with role badges
- Allows adding multiple members at once
- Inline role updates via dropdown
- Quick access toggle and remove buttons

#### `ManageMembersButton` (`src/app/w/_components/sidebar/manage-members-button.tsx`)
- Reusable button component that opens the manage members dialog
- Customizable variant, size, and className

## Usage Examples

### Example 1: Add to Dropdown Menu (like in nav-projects.tsx)

\`\`\`tsx
import { ManageMembersButton } from "./manage-members-button";

// Inside your component
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <SidebarMenuAction>
      <MoreHorizontal className="h-4 w-4" />
    </SidebarMenuAction>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    {/* Other menu items */}
    
    {(isAdmin || isProjectLead) && (
      <DropdownMenuItem asChild>
        <ManageMembersButton
          projectId={project.id}
          projectName={project.name}
          currentMembers={project.members} // See data structure below
          workspaceMembers={workspaceMembers}
          variant="ghost"
          className="w-full justify-start"
        />
      </DropdownMenuItem>
    )}
  </DropdownMenuContent>
</DropdownMenu>
\`\`\`

### Example 2: Add to Project Settings Page

\`\`\`tsx
import { ManageMembersButton } from "@/app/w/_components/sidebar/manage-members-button";

export default async function ProjectSettingsPage({ params }) {
  const project = await getProjectData(params.projectId);
  const workspaceMembers = await getWorkspaceMembers(project.workspaceId);
  
  // Transform project members to the required format
  const currentMembers = project.projectMembers.map(pm => ({
    id: pm.id,
    userId: pm.workspaceMember.userId,
    userName: pm.workspaceMember.user.surname || "Unknown",
    projectRole: pm.projectRole,
    hasAccess: pm.hasAccess,
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1>Project Settings</h1>
        <ManageMembersButton
          projectId={project.id}
          projectName={project.name}
          currentMembers={currentMembers}
          workspaceMembers={workspaceMembers}
        />
      </div>
      {/* Rest of settings page */}
    </div>
  );
}
\`\`\`

### Example 3: Direct Server Action Usage

\`\`\`tsx
"use client";

import { addProjectMembers } from "@/actions/project/manage-members";
import { toast } from "sonner";

async function handleAddMembers(projectId: string, userIds: string[]) {
  const result = await addProjectMembers(projectId, userIds);
  
  if (result.status === "success") {
    toast.success(result.message);
    // Refresh or update UI
  } else {
    toast.error(result.message);
  }
}
\`\`\`

## Data Structure

### ProjectMember Type
\`\`\`typescript
interface ProjectMember {
  id: string;           // ProjectMember ID from database
  userId: string;       // User ID
  userName: string;     // Display name
  projectRole: ProjectRole; // "LEAD" | "MEMBER" | "VIEWER"
  hasAccess: boolean;   // Whether member has access
}
\`\`\`

### Getting Project Members from Database

\`\`\`typescript
const project = await prisma.project.findUnique({
  where: { id: projectId },
  include: {
    projectMembers: {
      include: {
        workspaceMember: {
          include: {
            user: true,
          },
        },
      },
    },
  },
});

// Transform to required format
const currentMembers = project.projectMembers.map(pm => ({
  id: pm.id,
  userId: pm.workspaceMember.userId,
  userName: pm.workspaceMember.user.surname || "Unknown",
  projectRole: pm.projectRole,
  hasAccess: pm.hasAccess,
}));
\`\`\`

## Authorization

All actions check for proper authorization:
- User must be a workspace member
- User must be either:
  - Workspace admin (ADMIN role), OR
  - Project lead (LEAD role)

## Validation Rules

1. **Adding Members**
   - Cannot add members who are already in the project
   - Can only add workspace members
   - New members are assigned "MEMBER" role by default

2. **Removing Members**
   - Cannot remove the last project lead
   - Can only remove existing project members

3. **Updating Roles**
   - Cannot demote the last project lead
   - Valid roles: LEAD, MEMBER, VIEWER

4. **Toggling Access**
   - Simply toggles the hasAccess boolean
   - Does not affect member's role

## Integration with Edit Project Form

To add member management to the existing edit project form, you can add a button in the form:

\`\`\`tsx
// In edit-project-form.tsx, add after the member selection fields:

<div className="border-t pt-4 mt-4">
  <ManageMembersButton
    projectId={project.id}
    projectName={project.name}
    currentMembers={currentMembers}
    workspaceMembers={members}
    variant="outline"
    className="w-full"
  />
</div>
\`\`\`

## Error Handling

All actions return a standardized `ApiResponse`:

\`\`\`typescript
type ApiResponse = {
  status: "success" | "error";
  message: string;
}
\`\`\`

Always check the status and display the message to users via toast notifications.

## Cache Invalidation

All actions automatically invalidate the workspace project cache using:
\`\`\`typescript
await invalidateWorkspaceProjects(workspaceId);
\`\`\`

This ensures the UI updates reflect immediately across all project views.
