# Kanban API - Example JSON Payloads

## Move Card API

### Endpoint
```
POST /api/kanban/move
```

### Request Examples

#### Move to IN_PROGRESS
```json
{
  "subTaskId": "clx123abc",
  "newStatus": "IN_PROGRESS",
  "operationId": "move-clx123abc-IN_PROGRESS-1702123456789",
  "projectId": "proj_123",
  "workspaceId": "ws_456"
}
```

#### Move to COMPLETED (Admin/Lead only)
```json
{
  "subTaskId": "clx456def",
  "newStatus": "COMPLETED",
  "operationId": "move-clx456def-COMPLETED-1702123456790",
  "projectId": "proj_123",
  "workspaceId": "ws_456"
}
```

#### Move to BLOCKED (Admin/Lead only)
```json
{
  "subTaskId": "clx789ghi",
  "newStatus": "BLOCKED",
  "operationId": "move-clx789ghi-BLOCKED-1702123456791",
  "projectId": "proj_123",
  "workspaceId": "ws_456"
}
```

### Success Response
```json
{
  "success": true,
  "subTask": {
    "id": "clx123abc",
    "status": "IN_PROGRESS",
    "updatedAt": "2025-12-09T11:21:33.000Z"
  },
  "auditLog": {
    "id": "audit_789xyz",
    "operationId": "move-clx123abc-IN_PROGRESS-1702123456789",
    "action": "MOVE",
    "timestamp": "2025-12-09T11:21:33.000Z"
  }
}
```

### Error Responses

#### Permission Denied (Non-assignee trying to move)
```json
{
  "success": false,
  "error": "You are not authorized to move this card. Only the assignee, project admin, or project lead can move cards."
}
```

#### Restricted Status (Non-admin trying to move to COMPLETED)
```json
{
  "success": false,
  "error": "You are not authorized to move this card to COMPLETED status. Only admins and leads can move cards to this status."
}
```

#### Invalid Status
```json
{
  "success": false,
  "error": "Invalid status: INVALID_STATUS. Must be one of: TO_DO, IN_PROGRESS, BLOCKED, REVIEW, HOLD, COMPLETED"
}
```

#### Missing Fields
```json
{
  "success": false,
  "error": "Missing required fields: subTaskId, newStatus, workspaceId, projectId"
}
```

---

## Pin/Unpin Card API

### Endpoint
```
POST /api/kanban/pin
```

### Request Examples

#### Pin a Card
```json
{
  "subTaskId": "clx123abc",
  "isPinned": true,
  "operationId": "pin-clx123abc-1702123456789",
  "projectId": "proj_123",
  "workspaceId": "ws_456"
}
```

#### Unpin a Card
```json
{
  "subTaskId": "clx123abc",
  "isPinned": false,
  "operationId": "unpin-clx123abc-1702123456790",
  "projectId": "proj_123",
  "workspaceId": "ws_456"
}
```

### Success Response (Pin)
```json
{
  "success": true,
  "subTask": {
    "id": "clx123abc",
    "isPinned": true,
    "pinnedAt": "2025-12-09T11:21:33.000Z",
    "updatedAt": "2025-12-09T11:21:33.000Z"
  },
  "auditLog": {
    "id": "audit_790xyz",
    "operationId": "pin-clx123abc-1702123456789",
    "action": "PIN",
    "timestamp": "2025-12-09T11:21:33.000Z"
  }
}
```

### Success Response (Unpin)
```json
{
  "success": true,
  "subTask": {
    "id": "clx123abc",
    "isPinned": false,
    "pinnedAt": null,
    "updatedAt": "2025-12-09T11:21:35.000Z"
  },
  "auditLog": {
    "id": "audit_791xyz",
    "operationId": "unpin-clx123abc-1702123456790",
    "action": "UNPIN",
    "timestamp": "2025-12-09T11:21:35.000Z"
  }
}
```

### Error Responses

#### Permission Denied
```json
{
  "success": false,
  "error": "You are not authorized to pin/unpin cards. Only project admins and leads can pin cards."
}
```

#### Missing Fields
```json
{
  "success": false,
  "error": "Missing required fields: subTaskId, isPinned (boolean), workspaceId, projectId"
}
```

---

## Prisma Model Snippets

### Task Model (with Pinning Support)
```prisma
model Task {
  id           String      @id @default(uuid())
  name         String
  taskSlug     String      @unique
  description  String?
  status       TaskStatus? @default(TO_DO)
  
  // Pinning support for Kanban
  isPinned  Boolean   @default(false)
  pinnedAt  DateTime?
  pinnedBy  String?
  
  // ... other fields
  
  auditLogs  AuditLog[]
  
  @@index([isPinned])
}
```

### AuditLog Model (Comprehensive Audit Trail)
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  
  // Idempotency key - prevents duplicate operations
  operationId String @unique
  
  // Entity information
  entityType String // "TASK" | "SUBTASK"
  entityId   String // Task/SubTask ID
  
  // Action type
  action String // "CREATE" | "UPDATE" | "MOVE" | "DELETE" | "PIN" | "UNPIN"
  
  // Actor information
  userId String
  user   User   @relation(fields: [userId], references: [id])
  
  workspaceMemberId String
  workspaceMember   WorkspaceMember @relation(fields: [workspaceMemberId], references: [id])
  
  // Change tracking - JSON for flexibility
  beforeState Json? // Previous state (null for CREATE)
  afterState  Json  // New state
  
  // Context
  projectId String
  project   Project @relation(fields: [projectId], references: [id])
  
  taskId String?
  task   Task?  @relation(fields: [taskId], references: [id])
  
  // Metadata
  timestamp DateTime @default(now())
  ipAddress String?
  userAgent String?
  
  @@index([entityId])
  @@index([entityType])
  @@index([action])
  @@index([projectId])
  @@index([userId])
  @@index([timestamp])
  @@index([operationId])
  @@map("audit_log")
}
```

---

## Idempotency

### How It Works
1. Client generates or receives an `operationId` (unique identifier for the operation)
2. Server checks if an audit log with that `operationId` already exists
3. If exists, returns the cached result (no duplicate operation)
4. If not exists, processes the operation and creates audit log with the `operationId`

### Operation ID Format
```
{action}-{entityId}-{timestamp}-{random}
```

Examples:
- `move-clx123abc-IN_PROGRESS-1702123456789`
- `pin-clx456def-1702123456790-a7b3c9d`
- `unpin-clx789ghi-1702123456791-x4y2z8w`

### Benefits
- Prevents duplicate operations from network retries
- Ensures data consistency
- Provides audit trail for debugging
- Safe to retry failed requests

---

## Permission Matrix

| Action | Assignee | Project Member | Project Lead | Workspace Admin |
|--------|----------|----------------|--------------|-----------------|
| Move to TO_DO | ✅ | ❌ | ✅ | ✅ |
| Move to IN_PROGRESS | ✅ | ❌ | ✅ | ✅ |
| Move to REVIEW | ✅ | ❌ | ✅ | ✅ |
| Move to BLOCKED | ❌ | ❌ | ✅ | ✅ |
| Move to HOLD | ❌ | ❌ | ✅ | ✅ |
| Move to COMPLETED | ❌ | ❌ | ✅ | ✅ |
| Pin/Unpin | ❌ | ❌ | ✅ | ✅ |

---

## Audit Log Examples

### Move Operation
```json
{
  "id": "audit_789xyz",
  "operationId": "move-clx123abc-IN_PROGRESS-1702123456789",
  "entityType": "SUBTASK",
  "entityId": "clx123abc",
  "action": "MOVE",
  "userId": "user_456",
  "workspaceMemberId": "wm_789",
  "beforeState": {
    "status": "TO_DO",
    "name": "Design homepage mockup",
    "description": "Create initial design concepts",
    "tag": "DESIGN",
    "isPinned": false
  },
  "afterState": {
    "status": "IN_PROGRESS",
    "name": "Design homepage mockup",
    "description": "Create initial design concepts",
    "tag": "DESIGN",
    "isPinned": false
  },
  "projectId": "proj_123",
  "taskId": "clx123abc",
  "timestamp": "2025-12-09T11:21:33.000Z",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
}
```

### Pin Operation
```json
{
  "id": "audit_790xyz",
  "operationId": "pin-clx123abc-1702123456789",
  "entityType": "SUBTASK",
  "entityId": "clx123abc",
  "action": "PIN",
  "userId": "user_456",
  "workspaceMemberId": "wm_789",
  "beforeState": {
    "isPinned": false,
    "pinnedAt": null,
    "pinnedBy": null
  },
  "afterState": {
    "isPinned": true,
    "pinnedAt": "2025-12-09T11:21:33.000Z",
    "pinnedBy": "user_456"
  },
  "projectId": "proj_123",
  "taskId": "clx123abc",
  "timestamp": "2025-12-09T11:21:33.000Z",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
}
```
