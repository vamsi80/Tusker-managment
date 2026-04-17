# Implementation Plan - Team Member "Deactivate and Replace" Feature

This feature allows admins to mark a team member as **Inactive** and simultaneously transfer their task workload (assignee and reviewer roles) to another person in the workspace.

## User Review Required

> [!IMPORTANT]
> Change of scope from previous plan:
> 1. **No Deletion**: The member is NOT deleted from the database. Instead, an `isActive` flag is added to the `WorkspaceMember` model and set to `false`.
> 2. **Task Transfer Only**: Only `Task` assignments (Assignee/Reviewer) will be transferred. Board items and Indent details will remain with the original member for now.
> 3. **Automatic Project Enrollment**: The replacement member will be automatically added to any projects where they are receiving transferred tasks.

## Proposed Changes

### Database Schema

#### [MODIFY] [schema.prisma](file:///d:/Github/Tusker-managment/prisma/schema.prisma)
- Add `isActive Boolean @default(true)` to the `WorkspaceMember` model.
- Run `npx prisma generate` (and ideally a migration, but I will check if I can just use the client if migrations are handled elsewhere).

### Backend Service

#### [MODIFY] [workspace.service.ts](file:///d:/Github/Tusker-managment/src/server/services/workspace.service.ts)
- Add `deactivateMember` method:
    - Sets `isActive = false` for the member.
    - If `transferToMemberId` is provided:
        - Transfers all `Task` assignments (where the member is `assignee` or `reviewer`).
        - Ensures the replacement member is added to the corresponding `ProjectMember` records if missing.
- Update `getMembers` and `getWorkspaceMembers` to return the `isActive` status.

### Hono API

#### [MODIFY] [workspaces.ts](file:///d:/Github/Tusker-managment/src/hono/routes/workspaces.ts)
- Add `PATCH /:workspaceId/members/:memberId/deactivate` route.
- This route will handle both simple deactivation and deactivation with task transfer.

### API Client

#### [MODIFY] [workspaces.ts](file:///d:/Github/Tusker-managment/src/lib/api-client/workspaces.ts)
- Add `deactivateMember` method to call the new Hono route.

### Frontend UI

#### [MODIFY] [team-members-table.tsx](file:///d:/Github/Tusker-managment/src/app/w/[workspaceId]/team/_components/team-members-table.tsx)
- Update the table columns to show the actual `isActive` status instead of hardcoded "Active".
- Enhance the action menu:
    - Change "Remove Member" to "Deactivate Member" (or "Remove/Deactivate").
    - In the dialog, add the "Transfer tasks to..." selection logic.
- Filter the "Transfer to" member list to only show active members.

## Verification Plan

### Automated Tests
- Verify the deactivation logic via API calls.
- Verify that tasks are correctly reassigned to the new member.

### Manual Verification
1. Go to the Team page.
2. Identify a member with tasks.
3. Click "Deactivate Member".
4. Select a replacement member.
5. Confirm.
6. Check the table: The original member should show as "Inactive".
7. Open a project: Verify the tasks previously owned by the deactivated member are now assigned to the replacement.
