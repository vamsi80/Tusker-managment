# Gantt Chart Task Patch & Synchronization Plan

This plan details how to implement a secure, specialized patch endpoint for editing tasks directly from the Gantt chart, while strictly adhering to existing permissions and ensuring real-time UI synchronization.

## 1. Backend: Service Layer (`tasks.service.ts`)

We will introduce a highly-focused method `TasksService.patchGanttTask`. By isolating this from the main `updateTask`, we can strictly control which fields are mutable and optimize the database payload.

### Method Signature
```typescript
static async patchGanttTask({
  taskId,
  workspaceId,
  projectId,
  userId,
  permissions,
  data, // { startDate?, dueDate?, assigneeUserId?, tagIds? }
})
```

### Execution Steps
1. **Fetch & Validate Context**: Retrieve the task to check its `parentTaskId`, `createdById`, and `assigneeId`.
2. **Apply Strict RBAC Permissions**: 
   - Allow Workspace Admins and Project Managers unconditionally.
   - Allow Task Creators/Assignees.
   - Enforce hierarchy: prevent standard users from editing a task assigned to a Project Manager/Lead.
3. **Field Isolation**: Process only the whitelisted fields:
   - **Dates**: If `startDate` or `dueDate` are provided, parse them using `parseIST`. Calculate `days = (dueDate - startDate)`.
   - **Assignee**: Resolve `assigneeUserId` to a `ProjectMember` ID, auto-joining if the target user is a Workspace Admin/Owner.
   - **Tags**: Format the `tagIds` into Prisma's `{ set: [...] }` relation syntax.
4. **Prisma Execution**: Execute the `TaskRepository.updateTaskAndParentCount` or a custom precise update.
5. **Real-time Event Emission**: Trigger `TaskEvents.onTaskUpdated` passing both `oldData` and `newData`. This function handles cache invalidation and emits a `team_update` broadcast to connected clients.

## 2. Backend: API Route (Hono)

Create a dedicated Hono route (e.g., `PATCH /api/tasks/:taskId/gantt`) to consume this service method.

### Workflow
1. **Schema Validation**: Use Zod to ensure the incoming payload only contains `startDate`, `dueDate`, `assigneeUserId`, and `tagIds`.
2. **Context Extraction**: Get `workspaceId`, `projectId`, and `userId` from the session context.
3. **Execution**: Await `TasksService.patchGanttTask`.
4. **Response**: Return the newly updated task state so the frontend can immediately reconcile.

## 3. Frontend: Gantt Client Synchronization

To synchronize the Gantt bars based on data edited through the new backend endpoint, we need to implement optimistic updates and real-time syncing.

1. **Optimistic Updates**: 
   - When a user interacts with the Gantt chart (resizing a bar, changing dates, updating the assignee cell), immediately update the local React state (or store) to visually move the bar.
   - Make the API call to `PATCH /api/tasks/:taskId/gantt`.
   - If the API call fails, revert the state to the previous configuration.
2. **Real-Time Syncing (WebSockets / Polling)**:
   - Because `TaskEvents.onTaskUpdated` broadcasts a `team_update`, ensure the Gantt component is listening to this WebSocket channel (or Ably/Pusher). 
   - When a `team_update` event corresponding to `TASK_UPDATED` or `SUBTASK_UPDATED` is received for the current project, update the task in the local Gantt store to instantly reflect changes made by other team members.

## Implementation Phases

- [ ] **Phase 1**: Add `patchGanttTask` to `TasksService` in `src/server/services/task/tasks.service.ts`.
- [ ] **Phase 2**: Add the Hono API route for the Gantt patch action.
- [ ] **Phase 3**: Update the frontend Gantt component to trigger the new endpoint on bar edits and handle real-time sync events.
