# Project Member Management - Quick Reference

## 🚀 Quick Start

### Add "Manage Members" to Your Page

\`\`\`tsx
import { ManageMembersButton } from "@/app/w/_components/sidebar/manage-members-button";

// In your component
<ManageMembersButton
  projectId={project.id}
  projectName={project.name}
  currentMembers={currentMembers}
  workspaceMembers={workspaceMembers}
/>
\`\`\`

## 📋 Server Actions Reference

### Import
\`\`\`typescript
import {
  addProjectMembers,
  removeProjectMembers,
  updateProjectMemberRole,
  toggleProjectMemberAccess,
} from "@/actions/project/manage-members";
\`\`\`

### Add Members
\`\`\`typescript
const result = await addProjectMembers(
  projectId: string,
  memberUserIds: string[]
);
\`\`\`

### Remove Members
\`\`\`typescript
const result = await removeProjectMembers(
  projectId: string,
  memberUserIds: string[]
);
\`\`\`

### Update Role
\`\`\`typescript
const result = await updateProjectMemberRole(
  projectId: string,
  memberUserId: string,
  newRole: "LEAD" | "MEMBER" | "VIEWER"
);
\`\`\`

### Toggle Access
\`\`\`typescript
const result = await toggleProjectMemberAccess(
  projectId: string,
  memberUserId: string
);
\`\`\`

## 📊 Data Types

### ProjectMember
\`\`\`typescript
interface ProjectMember {
  id: string;           // ProjectMember record ID
  userId: string;       // User ID
  userName: string;     // Display name
  projectRole: "LEAD" | "MEMBER" | "VIEWER";
  hasAccess: boolean;
}
\`\`\`

### ApiResponse
\`\`\`typescript
type ApiResponse = {
  status: "success" | "error";
  message: string;
}
\`\`\`

## 🔐 Authorization

**Who can manage members?**
- ✅ Workspace Admins
- ✅ Project Leads
- ❌ Regular Members
- ❌ Viewers

## ⚠️ Business Rules

1. **Cannot remove last project lead**
2. **Cannot demote last project lead**
3. **Can only add workspace members**
4. **Cannot add duplicate members**

## 💡 Common Patterns

### Pattern 1: Add Button in Toolbar
\`\`\`tsx
<div className="flex justify-between">
  <h1>Project Settings</h1>
  <ManageMembersButton
    projectId={projectId}
    projectName={projectName}
    currentMembers={members}
    workspaceMembers={workspaceMembers}
    variant="default"
  />
</div>
\`\`\`

### Pattern 2: Dropdown Menu Item
\`\`\`tsx
<DropdownMenuItem asChild>
  <ManageMembersButton
    projectId={projectId}
    projectName={projectName}
    currentMembers={members}
    workspaceMembers={workspaceMembers}
    variant="ghost"
    className="w-full justify-start"
  />
</DropdownMenuItem>
\`\`\`

### Pattern 3: Direct Server Action
\`\`\`tsx
"use client";

import { addProjectMembers } from "@/actions/project/manage-members";
import { toast } from "sonner";

async function handleAddMember(projectId: string, userId: string) {
  const result = await addProjectMembers(projectId, [userId]);
  
  if (result.status === "success") {
    toast.success(result.message);
    router.refresh();
  } else {
    toast.error(result.message);
  }
}
\`\`\`

## 🎨 Customization

### Button Variants
\`\`\`tsx
variant="default"    // Solid button
variant="outline"    // Outlined button
variant="ghost"      // Transparent button
variant="link"       // Link style
\`\`\`

### Button Sizes
\`\`\`tsx
size="default"       // Normal size
size="sm"            // Small
size="lg"            // Large
size="icon"          // Icon only
\`\`\`

## 🔄 Data Fetching

### Get Project with Members
\`\`\`typescript
import { getFullProjectData } from "@/app/data/project/get-full-project-data";

const project = await getFullProjectData(projectId);

// project.projectMembers contains:
// [{ id, userId, userName, projectRole, hasAccess }]
\`\`\`

### Transform Prisma Data
\`\`\`typescript
const currentMembers = project.projectMembers.map(pm => ({
  id: pm.id,
  userId: pm.workspaceMember.userId,
  userName: pm.workspaceMember.user.surname || "Unknown",
  projectRole: pm.projectRole,
  hasAccess: pm.hasAccess,
}));
\`\`\`

## 🐛 Error Handling

### Standard Pattern
\`\`\`typescript
import { tryCatch } from "@/hooks/try-catch";

const { data: result, error } = await tryCatch(
  addProjectMembers(projectId, userIds)
);

if (error) {
  toast.error(error.message);
  console.error(error);
  return;
}

if (result.status === "success") {
  toast.success(result.message);
  router.refresh();
} else {
  toast.error(result.message);
}
\`\`\`

## 📝 Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "Project ID is required" | Missing projectId | Pass valid project ID |
| "You are not a member of this workspace" | User not in workspace | Check workspace membership |
| "Only workspace admins and project leads can..." | Unauthorized | Check user role |
| "Cannot remove the last project lead" | Business rule violation | Promote another member first |
| "All selected members are already in the project" | Duplicate addition | Check member list |
| "Selected users are not members of this workspace" | Invalid user IDs | Verify workspace membership |

## 🎯 Best Practices

1. **Always check authorization in UI**
   \`\`\`tsx
   {(isAdmin || isProjectLead) && <ManageMembersButton ... />}
   \`\`\`

2. **Show loading states**
   \`\`\`tsx
   const [pending, startTransition] = useTransition();
   <Button disabled={pending}>...</Button>
   \`\`\`

3. **Refresh after changes**
   \`\`\`tsx
   if (result.status === "success") {
     router.refresh();
   }
   \`\`\`

4. **Provide user feedback**
   \`\`\`tsx
   toast.success(result.message);
   toast.error(result.message);
   \`\`\`

## 🔍 Debugging Tips

1. **Check browser console** for detailed error logs
2. **Verify user authentication** with requireUser()
3. **Check workspace membership** in database
4. **Verify project exists** and user has access
5. **Check Prisma relations** are properly loaded
6. **Inspect cache invalidation** is working

## 📚 Related Files

- Actions: `src/actions/project/manage-members.ts`
- Dialog: `src/app/w/_components/sidebar/manage-members-dialog.tsx`
- Button: `src/app/w/_components/sidebar/manage-members-button.tsx`
- Data: `src/app/data/project/get-full-project-data.ts`
- Integration: `src/app/w/_components/sidebar/nav-projects.tsx`

## 🆘 Need Help?

See full documentation:
- `docs/PROJECT_MEMBER_MANAGEMENT.md` - Complete guide
- `docs/MEMBER_MANAGEMENT_ARCHITECTURE.md` - System architecture
- `MEMBER_MANAGEMENT_SUMMARY.md` - Implementation summary
