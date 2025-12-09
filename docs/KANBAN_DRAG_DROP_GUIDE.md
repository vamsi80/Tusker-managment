# Kanban Drag-and-Drop Implementation Guide

## Overview

This document provides a comprehensive guide to the permission-based Kanban drag-and-drop system with audit logging, optimistic UI updates, and server-side validation.

## Architecture

### Components

1. **KanbanBoard** (`kanban-board.tsx`) - Client component handling drag-and-drop UI
2. **updateSubTaskStatus** (`subtask-status-actions.ts`) - Server action for status updates
3. **SubTaskStatusAuditLog** (Prisma model) - Database audit trail

### Permission Rules

| User Role | Can Move Cards | Can Move to COMPLETED/BLOCKED/HOLD |
|-----------|---------------|-----------------------------------|
| Subtask Assignee | ✅ Yes | ❌ No |
| Project Lead | ✅ Yes | ✅ Yes |
| Workspace Admin | ✅ Yes | ✅ Yes |
| Other Members | ❌ No | ❌ No |

## API Documentation

### Server Action: `updateSubTaskStatus`

**Location:** `src/app/actions/subtask-status-actions.ts`

**Signature:**
```typescript
async function updateSubTaskStatus(
    subTaskId: string,
    newStatus: TaskStatus,
    workspaceId: string,
    projectId: string
): Promise<UpdateSubTaskStatusResult>
```

**Parameters:**
- `subTaskId`: Unique identifier of the subtask
- `newStatus`: Target status (TO_DO | IN_PROGRESS | BLOCKED | REVIEW | HOLD | COMPLETED)
- `workspaceId`: Current workspace ID
- `projectId`: Current project ID

**Returns:**
```typescript
interface UpdateSubTaskStatusResult {
    success: boolean;
    error?: string;
    subTask?: {
        id: string;
        status: TaskStatus;
        updatedAt: Date;
    };
}
```

### Example Request/Response

**Successful Update:**
```typescript
// Request
await updateSubTaskStatus(
    "subtask_123",
    "IN_PROGRESS",
    "workspace_456",
    "project_789"
);

// Response
{
    success: true,
    subTask: {
        id: "subtask_123",
        status: "IN_PROGRESS",
        updatedAt: "2025-12-09T14:40:00.000Z"
    }
}
```

**Permission Denied:**
```typescript
// Response
{
    success: false,
    error: "You are not authorized to move this card. Only the assignee, project admin, or project lead can move cards."
}
```

**Restricted Status:**
```typescript
// Response
{
    success: false,
    error: "Only project admins and leads can move cards to COMPLETED status."
}
```

## Database Schema

### SubTaskStatusAuditLog Model

```prisma
model SubTaskStatusAuditLog {
  id                String     @id @default(cuid())
  subTaskId         String
  fromStatus        TaskStatus?
  toStatus          TaskStatus
  changedBy         String     // User ID
  workspaceMemberId String
  timestamp         DateTime   @default(now())

  // Relations
  subTask         Task            @relation(fields: [subTaskId], references: [id], onDelete: Cascade)
  workspaceMember WorkspaceMember @relation(fields: [workspaceMemberId], references: [id], onDelete: Cascade)

  @@index([subTaskId])
  @@index([changedBy])
  @@index([timestamp])
  @@map("subtask_status_audit_log")
}
```

### Example Audit Log Entry

```json
{
  "id": "audit_abc123",
  "subTaskId": "subtask_123",
  "fromStatus": "TO_DO",
  "toStatus": "IN_PROGRESS",
  "changedBy": "user_456",
  "workspaceMemberId": "wm_789",
  "timestamp": "2025-12-09T14:40:00.000Z"
}
```

## Client-Side Implementation

### Drag-and-Drop Flow

```typescript
// 1. User drags card
handleDragStart(event) → setActiveSubTask(subTask)

// 2. User drops card
handleDragEnd(event) → {
    // Optimistic update
    setSubTasks(updated)
    
    // Server call
    const result = await updateSubTaskStatus(...)
    
    // Handle result
    if (result.success) {
        toast.success()
    } else {
        // Rollback
        setSubTasks(previous)
        toast.error(result.error)
    }
}
```

### Error Handling

**Network Error:**
```typescript
try {
    const result = await updateSubTaskStatus(...)
} catch (error) {
    // Rollback optimistic update
    setSubTasks(previousState)
    toast.error("An unexpected error occurred")
}
```

**Permission Error:**
```typescript
if (!result.success) {
    // Rollback optimistic update
    setSubTasks(previousState)
    // Show specific error message
    toast.error(result.error)
}
```

## Security Features

### 1. Authentication
- All requests require authenticated user via `requireUser()`
- Session validation on every request

### 2. Authorization
- Workspace membership verification
- Project access validation
- Role-based permission checks

### 3. Input Validation
- Status enum validation
- Subtask ownership verification
- Project membership confirmation

### 4. Audit Trail
- Every status change logged
- Includes who, what, when
- Immutable audit records

## Testing Guide

### Unit Tests

```typescript
describe('updateSubTaskStatus', () => {
    it('should update status for assignee', async () => {
        const result = await updateSubTaskStatus(
            'subtask_1',
            'IN_PROGRESS',
            'workspace_1',
            'project_1'
        );
        expect(result.success).toBe(true);
    });

    it('should deny non-assignee members', async () => {
        const result = await updateSubTaskStatus(
            'subtask_1',
            'IN_PROGRESS',
            'workspace_1',
            'project_1'
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('not authorized');
    });

    it('should deny member moving to COMPLETED', async () => {
        const result = await updateSubTaskStatus(
            'subtask_1',
            'COMPLETED',
            'workspace_1',
            'project_1'
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('Only project admins');
    });
});
```

### Integration Tests

```typescript
describe('Kanban Drag-and-Drop', () => {
    it('should update UI optimistically', async () => {
        const { getByText } = render(<KanbanBoard {...props} />);
        
        // Drag card
        const card = getByText('Test Subtask');
        fireEvent.dragStart(card);
        fireEvent.drop(getByText('In Progress'));
        
        // Check optimistic update
        expect(card).toBeInTheDocument();
        
        // Wait for server response
        await waitFor(() => {
            expect(mockUpdateSubTaskStatus).toHaveBeenCalled();
        });
    });

    it('should rollback on error', async () => {
        mockUpdateSubTaskStatus.mockResolvedValue({ success: false });
        
        // Perform drag
        // ...
        
        // Check rollback
        await waitFor(() => {
            expect(card).toBeInColumn('To Do');
        });
    });
});
```

## Performance Considerations

1. **Optimistic Updates**: Immediate UI feedback
2. **Debouncing**: Prevent rapid successive updates
3. **Caching**: Revalidate only affected data
4. **Indexes**: Database indexes on audit log queries

## Monitoring

### Metrics to Track

- Success rate of status updates
- Average response time
- Permission denial rate
- Audit log growth rate

### Error Monitoring

```typescript
// Log errors for monitoring
console.error("Error updating subtask status:", {
    subTaskId,
    newStatus,
    error: error.message,
    timestamp: new Date().toISOString()
});
```

## Migration Guide

### Database Migration

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name add_subtask_audit_log

# Apply to production
npx prisma migrate deploy
```

### Rollback Plan

1. Revert database migration
2. Remove audit log creation code
3. Restore previous drag handler
4. Clear cache

## Troubleshooting

### Common Issues

**Issue:** Cards snap back after drop
**Solution:** Check server action response, verify permissions

**Issue:** Audit logs not created
**Solution:** Verify Prisma schema, run migrations

**Issue:** Permission errors
**Solution:** Check getUserPermissions return values

## Future Enhancements

1. Bulk status updates
2. Status change history in UI
3. Undo/redo functionality
4. Real-time collaboration
5. Custom status workflows
