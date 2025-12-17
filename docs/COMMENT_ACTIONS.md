# Comment Actions - Centralized Architecture

## Overview

All comment-related server actions have been centralized in `src/actions/comment/` following the optimization plan. This provides a clean, maintainable structure for managing comments and review comments.

## File Structure

```
src/actions/comment/
├── create-comment.ts          # Create task comments and replies
├── update-comment.ts          # Edit existing comments
├── delete-comment.ts          # Soft delete comments
├── create-review-comment.ts   # Create review comments for subtasks
└── index.ts                   # Barrel exports
```

## Actions

### 1. Create Comment (`createCommentAction`)

**File**: `create-comment.ts`

**Purpose**: Create a new comment on a task or reply to an existing comment

**Parameters**:
- `taskId: string` - ID of the task to comment on
- `content: string` - Comment content
- `workspaceId: string` - Workspace ID for permission check
- `projectId: string` - Project ID for permission check
- `parentCommentId?: string` - Optional parent comment ID for replies

**Features**:
- ✅ User authentication
- ✅ Permission verification
- ✅ Task existence validation
- ✅ Reply depth limiting (max 5 levels)
- ✅ Automatic cache invalidation

**Usage**:
```typescript
import { createCommentAction } from "@/actions/comment";

const result = await createCommentAction(
    taskId,
    "This is my comment",
    workspaceId,
    projectId
);

if (result.success) {
    console.log("Comment created:", result.comment);
}
```

**Reply Example**:
```typescript
const reply = await createCommentAction(
    taskId,
    "This is a reply",
    workspaceId,
    projectId,
    parentCommentId  // Makes it a reply
);
```

---

### 2. Update Comment (`updateCommentAction`)

**File**: `update-comment.ts`

**Purpose**: Edit an existing comment

**Parameters**:
- `commentId: string` - ID of the comment to update
- `newContent: string` - New comment content

**Features**:
- ✅ User authentication
- ✅ Ownership verification (users can only edit their own comments)
- ✅ Deleted comment protection
- ✅ Automatic `isEdited` flag and `editedAt` timestamp
- ✅ Cache invalidation

**Usage**:
```typescript
import { updateCommentAction } from "@/actions/comment";

const result = await updateCommentAction(
    commentId,
    "Updated comment text"
);

if (result.success) {
    console.log("Comment updated:", result.comment);
}
```

---

### 3. Delete Comment (`deleteCommentAction`)

**File**: `delete-comment.ts`

**Purpose**: Soft delete a comment (marks as deleted, doesn't remove from database)

**Parameters**:
- `commentId: string` - ID of the comment to delete

**Features**:
- ✅ User authentication
- ✅ Ownership verification
- ✅ Soft delete (preserves data)
- ✅ Sets `isDeleted` flag and `deletedAt` timestamp
- ✅ Cache invalidation

**Usage**:
```typescript
import { deleteCommentAction } from "@/actions/comment";

const result = await deleteCommentAction(commentId);

if (result.success) {
    console.log("Comment deleted");
}
```

---

### 4. Create Review Comment (`createReviewCommentAction`)

**File**: `create-review-comment.ts`

**Purpose**: Create a review comment for a subtask when moving to REVIEW status

**Parameters**:
- `subTaskId: string` - ID of the subtask
- `text: string` - Comment text
- `workspaceId: string` - Workspace ID for permission check
- `projectId: string` - Project ID for permission check
- `attachmentData?: object` - Optional attachment (base64 encoded)

**Attachment Structure**:
```typescript
{
    fileName: string;
    fileType: string;
    fileSize: number;
    base64Data: string;
}
```

**Features**:
- ✅ User authentication
- ✅ Permission verification
- ✅ Subtask validation
- ✅ Supports text, attachments, or both
- ✅ Automatic cache invalidation (review comments + project tasks)

**Usage**:
```typescript
import { createReviewCommentAction } from "@/actions/comment";

// Text only
const result = await createReviewCommentAction(
    subTaskId,
    "Please review this work",
    workspaceId,
    projectId
);

// With attachment
const resultWithAttachment = await createReviewCommentAction(
    subTaskId,
    "See attached screenshot",
    workspaceId,
    projectId,
    {
        fileName: "screenshot.png",
        fileType: "image/png",
        fileSize: 102400,
        base64Data: "data:image/png;base64,..."
    }
);
```

---

## Return Types

All actions return a consistent result structure:

### Success Response
```typescript
{
    success: true,
    comment?: {
        id: string;
        content: string;
        createdAt: Date;
        user: {
            id: string;
            name: string | null;
            surname: string | null;
            image: string | null;
            email: string;
        };
    }
}
```

### Error Response
```typescript
{
    success: false,
    error: string
}
```

---

## Cache Invalidation

All actions automatically invalidate relevant caches:

### Task Comments
```typescript
await invalidateTaskComments(taskId);
```

**Invalidates**:
- `task-comments-${taskId}`
- `task-${taskId}`
- `comments-all`

### Review Comments
```typescript
await invalidateReviewComments(subTaskId);
await invalidateProjectTasks(projectId);
```

**Invalidates**:
- `review-comments-${subTaskId}`
- `subtask-${subTaskId}`
- `review-comments-all`
- `project-tasks-${projectId}`

---

## Security Features

### 1. Authentication
All actions require a valid user session:
```typescript
const user = await requireUser();
```

### 2. Permission Checks
Actions verify workspace/project access:
```typescript
const permissions = await getUserPermissions(workspaceId, projectId);
if (!permissions.workspaceMemberId) {
    return { success: false, error: "No access" };
}
```

### 3. Ownership Verification
Update and delete actions verify ownership:
```typescript
if (comment.userId !== user.id) {
    return { success: false, error: "Not your comment" };
}
```

### 4. Input Validation
All inputs are validated before processing:
```typescript
if (!content.trim()) {
    return { success: false, error: "Content required" };
}
```

---

## Migration from Old Structure

### Before (Scattered)
```typescript
// Old location
import { createTaskComment } from "@/app/w/[workspaceId]/p/[slug]/task/_components/shared/actions/comment-actions";
```

### After (Centralized)
```typescript
// New location
import { createCommentAction } from "@/actions/comment";
```

---

## Best Practices

### 1. Always Handle Errors
```typescript
const result = await createCommentAction(...);

if (!result.success) {
    toast.error(result.error);
    return;
}

// Use result.comment
```

### 2. Use Type-Safe Imports
```typescript
import type { CreateCommentResult } from "@/actions/comment";

const handleComment = async (): Promise<CreateCommentResult> => {
    return await createCommentAction(...);
};
```

### 3. Optimistic Updates
```typescript
// Update UI immediately
setComments(prev => [...prev, optimisticComment]);

// Then call server action
const result = await createCommentAction(...);

if (!result.success) {
    // Revert on failure
    setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
}
```

---

## Performance Optimizations

### 1. Cache Tags
Uses Next.js cache tags for efficient invalidation:
- Faster than `revalidatePath`
- More granular control
- Better performance

### 2. Selective Queries
Only fetches required fields:
```typescript
select: {
    id: true,
    projectId: true,
    // Only what we need
}
```

### 3. Parallel Validation
Uses `Promise.all` where possible for concurrent checks

---

## Testing

### Unit Test Example
```typescript
import { createCommentAction } from "@/actions/comment";

describe("createCommentAction", () => {
    it("should create a comment", async () => {
        const result = await createCommentAction(
            "task-123",
            "Test comment",
            "workspace-456",
            "project-789"
        );

        expect(result.success).toBe(true);
        expect(result.comment).toBeDefined();
    });

    it("should reject empty content", async () => {
        const result = await createCommentAction(
            "task-123",
            "",
            "workspace-456",
            "project-789"
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("required");
    });
});
```

---

## Future Enhancements

### Planned Features
- [ ] Comment reactions (👍, ❤️, etc.)
- [ ] Comment mentions (@username)
- [ ] Comment notifications
- [ ] Rich text formatting
- [ ] Image/file attachments for regular comments
- [ ] Comment search
- [ ] Comment analytics

---

## Related Documentation

- [Performance Optimization](../docs/PERFORMANCE_OPTIMIZATION.md)
- [On-Demand Loading](../docs/ON_DEMAND_LOADING.md)
- [Complete Optimization Plan](../COMPLETE_OPTIMIZATION_PLAN.md)

---

## Summary

✅ **Centralized comment actions** in `src/actions/comment/`  
✅ **Consistent API** across all comment operations  
✅ **Type-safe** with exported TypeScript interfaces  
✅ **Secure** with authentication and permission checks  
✅ **Performant** with cache invalidation and optimized queries  
✅ **Maintainable** with clear separation of concerns  

**Result: Clean, scalable comment management! 🚀**
