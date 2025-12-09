# Fast Kanban Implementation Plan

## Overview
Building a high-performance Kanban board with React, Next.js 15, and Tailwind CSS featuring:
- ⚡ Instant loading with skeleton loaders
- 🔒 Permission-based drag & drop
- 🎯 Optimistic UI with rollback
- 📝 Complete audit logging
- 🔄 Cache revalidation
- 📌 Pin/unpin cards
- 🚫 Duplicate prevention via operationId

## Architecture

### 1. Data Flow
```
User Action → Optimistic UI Update → Server Action → Database Transaction → Cache Invalidation → UI Sync
```

### 2. Permission Model
- **Can Move Card**: Assignee OR Project Admin OR Project Lead
- **Can Move to COMPLETED/BLOCKED/HOLD**: Project Admin OR Project Lead ONLY
- **Can Pin/Unpin**: Project Admin OR Project Lead

### 3. Audit Logging (Enhanced)
Single `AuditLog` table for ALL operations:
- CREATE (task/subtask)
- UPDATE (task/subtask fields)
- MOVE (status changes)
- DELETE (soft/hard delete)
- PIN/UNPIN (card pinning)

## Database Schema Updates

### New AuditLog Model (Replaces SubTaskStatusAuditLog)
```prisma
model AuditLog {
  id            String   @id @default(cuid())
  operationId   String   @unique // Idempotency key
  entityType    String   // "TASK" | "SUBTASK"
  entityId      String   // Task/SubTask ID
  action        String   // "CREATE" | "UPDATE" | "MOVE" | "DELETE" | "PIN" | "UNPIN"
  
  // Actor information
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  workspaceMemberId String
  workspaceMember   WorkspaceMember @relation(fields: [workspaceMemberId], references: [id])
  
  // Change tracking
  beforeState   Json?    // Previous state (null for CREATE)
  afterState    Json     // New state
  
  // Metadata
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  timestamp     DateTime @default(now())
  ipAddress     String?
  userAgent     String?
  
  @@index([entityId])
  @@index([projectId])
  @@index([userId])
  @@index([timestamp])
  @@index([operationId])
  @@map("audit_log")
}
```

### Task Model Updates (Add pinning)
```prisma
model Task {
  // ... existing fields
  isPinned      Boolean  @default(false)
  pinnedAt      DateTime?
  pinnedBy      String?
  // ... rest of fields
}
```

## Implementation Components

### 1. Skeleton Loaders
- `KanbanBoardSkeleton` - Full board skeleton
- `KanbanColumnSkeleton` - Individual column skeleton
- `KanbanCardSkeleton` - Card skeleton

### 2. Server Actions
- `updateSubTaskStatusWithAudit` - Move cards with audit
- `pinSubTask` - Pin/unpin cards
- `bulkMoveSubTasks` - Bulk operations
- All with operationId idempotency

### 3. API Routes (Optional for webhooks/integrations)
- `POST /api/kanban/move` - Move card endpoint
- `POST /api/kanban/pin` - Pin/unpin endpoint
- Returns full Prisma models + audit logs

### 4. Client Components
- Enhanced `KanbanBoard` with optimistic updates
- `KanbanCard` with pin indicator
- `KanbanToolbar` with filters
- Error boundaries with rollback

## Features Implementation

### A. Optimistic UI with Rollback
```typescript
// 1. Store previous state
const previousState = subTasks.find(t => t.id === id);

// 2. Optimistic update
setSubTasks(optimisticUpdate);

// 3. Server action
const result = await serverAction();

// 4. Rollback on failure
if (!result.success) {
  setSubTasks(rollbackToPrevious);
}
```

### B. Idempotency (Duplicate Prevention)
```typescript
// Generate unique operation ID
const operationId = `move-${subTaskId}-${newStatus}-${Date.now()}`;

// Server checks for duplicate operationId
const existing = await prisma.auditLog.findUnique({
  where: { operationId }
});

if (existing) {
  return { success: true, message: "Already processed" };
}
```

### C. Pin/Unpin Cards
- Pinned cards appear at top of column
- Visual indicator (pin icon)
- Only admins/leads can pin
- Audit logged

### D. Cache Strategy
```typescript
// Revalidate on mutations
revalidateTag(`project-tasks-${projectId}`);
revalidateTag(`subtasks-${taskId}`);
revalidatePath(`/w/${workspaceId}/p/${slug}/task`);
```

## Example JSON Payloads

### Move Card Request
```json
{
  "subTaskId": "clx123abc",
  "newStatus": "IN_PROGRESS",
  "operationId": "move-clx123abc-IN_PROGRESS-1702123456789",
  "projectId": "proj_123",
  "workspaceId": "ws_456"
}
```

### Move Card Response
```json
{
  "success": true,
  "subTask": {
    "id": "clx123abc",
    "status": "IN_PROGRESS",
    "updatedAt": "2025-12-09T11:21:33Z"
  },
  "auditLog": {
    "id": "audit_789",
    "operationId": "move-clx123abc-IN_PROGRESS-1702123456789",
    "action": "MOVE",
    "beforeState": { "status": "TO_DO" },
    "afterState": { "status": "IN_PROGRESS" },
    "timestamp": "2025-12-09T11:21:33Z"
  }
}
```

### Pin Card Request
```json
{
  "subTaskId": "clx123abc",
  "isPinned": true,
  "operationId": "pin-clx123abc-1702123456789",
  "projectId": "proj_123"
}
```

## Performance Optimizations

1. **Lazy Loading**: Kanban view loaded only when selected
2. **Skeleton Loaders**: Instant perceived performance
3. **Optimistic Updates**: No waiting for server
4. **Cache Revalidation**: Smart invalidation, not full refetch
5. **Transaction Batching**: Audit logs in same transaction
6. **Index Optimization**: All audit queries indexed

## File Structure
```
src/
├── app/
│   ├── actions/
│   │   ├── subtask-status-actions.ts (enhanced)
│   │   ├── subtask-pin-actions.ts (new)
│   │   └── audit-log-actions.ts (new)
│   ├── api/
│   │   └── kanban/
│   │       ├── move/route.ts (new)
│   │       └── pin/route.ts (new)
│   └── w/[workspaceId]/p/[slug]/task/
│       └── _components/
│           └── kanban/
│               ├── kanban-board.tsx (enhanced)
│               ├── kanban-card.tsx (enhanced)
│               ├── kanban-skeleton.tsx (new)
│               └── kanban-container.tsx (enhanced)
└── prisma/
    └── schema.prisma (updated)
```

## Testing Strategy

1. **Unit Tests**: Server actions with mocked Prisma
2. **Integration Tests**: Full flow with test database
3. **E2E Tests**: Drag & drop scenarios
4. **Permission Tests**: Verify all permission rules
5. **Idempotency Tests**: Duplicate operation handling

## Migration Steps

1. Create new AuditLog model
2. Migrate existing SubTaskStatusAuditLog data
3. Add isPinned fields to Task model
4. Update server actions
5. Enhance UI components
6. Deploy with feature flag
7. Monitor performance
8. Remove old audit table

---

**Status**: Ready for implementation
**Priority**: High
**Estimated Time**: 4-6 hours
