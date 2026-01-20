# Schema Migration Guide: User as Permanent Actor

## Overview
This migration refactors the database schema to follow the principle:
- **User** = Permanent actor for all business actions (legally auditable)
- **WorkspaceMember** = Authorization context only (userId + workspaceId + role)

## Schema Changes Summary

### 1. **User Model** ✅
**Changes:**
- Added relations for all business actions
- Now owns: tasks, indents, approvals, comments, units

**New Relations:**
```prisma
createdTasks          Task[]            @relation("TaskCreator")
assignedTasks         Task[]            @relation("TaskAssignee")
reviewComments        ReviewComment[]
requestedIndents      IndentDetails[]   @relation("IndentRequestor")
assignedIndents       IndentDetails[]   @relation("IndentAssignee")
quantityApprovedItems IndentItem[]      @relation("QuantityApprover")
finalApprovedItems    IndentItem[]      @relation("FinalApprover")
createdUnits          Unit[]
```

### 2. **WorkspaceMember Model** ✅
**Changes:**
- Removed ALL business action relations
- Now ONLY contains: userId, workspaceId, workspaceRole, timestamps
- Kept only: projectMembers relation for authorization

**Removed Relations:**
- ❌ tasks
- ❌ reviewComments
- ❌ indentDetails (requestor/assignee)
- ❌ units
- ❌ quantityApprovedItems
- ❌ finalApprovedItems

### 3. **Task Model** ✅
**Field Changes:**
```diff
- createdById    String (WorkspaceMember)
- assigneeTo     String? (ProjectMember)
- pinnedBy       String?

+ createdByUserId   String (User)
+ assignedToUserId  String? (User)
+ workspaceId       String
+ pinnedByUserId    String?
```

**Relation Changes:**
```diff
- createdBy  WorkspaceMember
- assignee   ProjectMember?

+ createdBy  User  @relation("TaskCreator")
+ assignedTo User? @relation("TaskAssignee")
```

### 4. **ReviewComment Model** ✅
**Field Changes:**
```diff
- authorId String (WorkspaceMember)

+ authorUserId String (User)
+ workspaceId  String
```

**Relation Changes:**
```diff
- author WorkspaceMember

+ author User
```

### 5. **IndentDetails Model** ✅
**Field Changes:**
```diff
- requestedBy String (WorkspaceMember)
- assignedTo  String? (WorkspaceMember)

+ workspaceId        String
+ requestedByUserId  String (User)
+ assignedToUserId   String? (User)
```

**Relation Changes:**
```diff
- requestor WorkspaceMember
- assignee  WorkspaceMember?

+ requestor User  @relation("IndentRequestor")
+ assignee  User? @relation("IndentAssignee")
```

### 6. **IndentItem Model** ✅
**Field Changes:**
```diff
- quantityApprovedBy String? (WorkspaceMember)
- finalApprovedBy    String? (WorkspaceMember)

+ quantityApprovedByUserId String? (User)
+ finalApprovedByUserId    String? (User)
```

**Relation Changes:**
```diff
- quantityApprovedBy WorkspaceMember?
- finalApprovedBy    WorkspaceMember?

+ quantityApprovedBy User? @relation("QuantityApprover")
+ finalApprovedBy    User? @relation("FinalApprover")
```

### 7. **Unit Model** ✅
**Field Changes:**
```diff
- createdBy String? (WorkspaceMember)

+ createdByUserId String? (User)
```

**Relation Changes:**
```diff
- creator WorkspaceMember?

+ creator User?
```

---

## Application Code Migration Required

### 1. **Task Creation/Updates**
**Before:**
```typescript
const task = await db.task.create({
  data: {
    createdById: workspaceMemberId,  // ❌ Wrong
    assigneeTo: projectMemberId,     // ❌ Wrong
  }
});
```

**After:**
```typescript
const task = await db.task.create({
  data: {
    createdByUserId: userId,         // ✅ Correct
    assignedToUserId: userId,        // ✅ Correct
    workspaceId: workspaceId,        // ✅ Required
  }
});
```

### 2. **Indent Creation/Updates**
**Before:**
```typescript
const indent = await db.indentDetails.create({
  data: {
    requestedBy: workspaceMemberId,  // ❌ Wrong
    assignedTo: workspaceMemberId,   // ❌ Wrong
  }
});
```

**After:**
```typescript
const indent = await db.indentDetails.create({
  data: {
    workspaceId: workspaceId,        // ✅ Required
    requestedByUserId: userId,       // ✅ Correct
    assignedToUserId: userId,        // ✅ Correct
  }
});
```

### 3. **Indent Item Approvals**
**Before:**
```typescript
const item = await db.indentItem.update({
  where: { id },
  data: {
    quantityApprovedBy: workspaceMemberId,  // ❌ Wrong
    finalApprovedBy: workspaceMemberId,     // ❌ Wrong
  }
});
```

**After:**
```typescript
const item = await db.indentItem.update({
  where: { id },
  data: {
    quantityApprovedByUserId: userId,  // ✅ Correct
    finalApprovedByUserId: userId,     // ✅ Correct
  }
});
```

### 4. **Review Comments**
**Before:**
```typescript
const comment = await db.reviewComment.create({
  data: {
    authorId: workspaceMemberId,  // ❌ Wrong
  }
});
```

**After:**
```typescript
const comment = await db.reviewComment.create({
  data: {
    authorUserId: userId,         // ✅ Correct
    workspaceId: workspaceId,     // ✅ Required
  }
});
```

### 5. **Unit Creation**
**Before:**
```typescript
const unit = await db.unit.create({
  data: {
    createdBy: workspaceMemberId,  // ❌ Wrong
  }
});
```

**After:**
```typescript
const unit = await db.unit.create({
  data: {
    createdByUserId: userId,       // ✅ Correct
  }
});
```

---

## Authorization Pattern (CRITICAL)

Even though actions are stored against `User`, **permissions MUST be validated using WorkspaceMember**:

```typescript
// ✅ CORRECT Authorization Pattern
async function createTask(userId: string, workspaceId: string, data: any) {
  // 1. Validate workspace membership and role
  const member = await db.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId
      }
    }
  });
  
  if (!member) {
    throw new Error("Not a member of this workspace");
  }
  
  // 2. Check role permissions
  if (!canCreateTask(member.workspaceRole)) {
    throw new Error("Insufficient permissions");
  }
  
  // 3. Create action with userId (permanent record)
  const task = await db.task.create({
    data: {
      ...data,
      createdByUserId: userId,      // Store against User
      workspaceId: workspaceId,
    }
  });
  
  return task;
}
```

---

## Data Queries - Include Pattern

### Fetching Tasks with Creator
**Before:**
```typescript
const tasks = await db.task.findMany({
  include: {
    createdBy: {              // ❌ WorkspaceMember
      include: { user: true }
    }
  }
});
```

**After:**
```typescript
const tasks = await db.task.findMany({
  include: {
    createdBy: true,          // ✅ User directly
  }
});
```

### Fetching Indents with Requestor
**Before:**
```typescript
const indents = await db.indentDetails.findMany({
  include: {
    requestor: {              // ❌ WorkspaceMember
      include: { user: true }
    }
  }
});
```

**After:**
```typescript
const indents = await db.indentDetails.findMany({
  include: {
    requestor: true,          // ✅ User directly
    assignee: true,
  }
});
```

---

## Migration Steps

### Step 1: Run Prisma Migration
```bash
npx prisma db push
# or
npx prisma migrate dev --name user_as_permanent_actor
```

### Step 2: Update Server Actions
Search and replace in your codebase:
- `createdById` → `createdByUserId`
- `assigneeTo` → `assignedToUserId`
- `requestedBy` → `requestedByUserId`
- `assignedTo` → `assignedToUserId`
- `quantityApprovedBy` → `quantityApprovedByUserId`
- `finalApprovedBy` → `finalApprovedByUserId`
- `authorId` → `authorUserId`
- `createdBy` (in Unit) → `createdByUserId`

### Step 3: Update Data Fetching Functions
Update all `include` statements in:
- `src/data/**/*.ts`
- Server actions
- API routes

### Step 4: Update Type Definitions
Regenerate Prisma types:
```bash
npx prisma generate
```

### Step 5: Test Authorization
Ensure all authorization checks use WorkspaceMember:
```typescript
// Check membership
const member = await getWorkspaceMember(userId, workspaceId);
// Check role
if (member.workspaceRole !== 'ADMIN') throw new Error();
// Store action against User
await createAction({ userId, ... });
```

---

## Benefits of This Architecture

### 1. **Legal Auditability** ✅
- All approvals tracked to permanent User accounts
- User cannot escape accountability by leaving workspace
- Compliance-ready for GST, procurement audits

### 2. **Data Integrity** ✅
- Historical records remain intact even if:
  - User leaves workspace
  - Workspace is deleted
  - User role changes

### 3. **Multi-Tenant Scalability** ✅
- User can work across multiple workspaces
- Actions tracked globally per user
- Workspace-specific authorization via WorkspaceMember

### 4. **Future-Proof** ✅
- Ready for Purchase Orders
- Ready for Delivery tracking
- Ready for Payment records
- Ready for Audit logs

---

## Files to Update

### High Priority (Core Actions)
- [ ] `src/actions/tasks/*.ts`
- [ ] `src/actions/procurement/indents.ts`
- [ ] `src/actions/procurement/indent-items.ts`
- [ ] `src/data/tasks/*.ts`
- [ ] `src/data/procurement/*.ts`

### Medium Priority (UI Components)
- [ ] Task creation forms
- [ ] Indent creation forms
- [ ] Approval workflows
- [ ] Comment components

### Low Priority (Display)
- [ ] Task lists
- [ ] Indent lists
- [ ] User avatars/names

---

## Testing Checklist

- [ ] Create task as user in workspace
- [ ] Assign task to another user
- [ ] Create indent request
- [ ] Approve indent quantity
- [ ] Final approve indent
- [ ] Add review comment
- [ ] Create custom unit
- [ ] Verify user can't access other workspace data
- [ ] Verify actions persist after user leaves workspace

---

## Questions?

If you encounter issues during migration, check:
1. Is userId available in the context?
2. Is workspaceId being passed correctly?
3. Are you validating WorkspaceMember before actions?
4. Are includes updated to use User directly?
