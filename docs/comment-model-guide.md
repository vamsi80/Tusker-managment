# Comment Model Documentation

## Overview
The Comment model enables task-based messaging between authorized users (workspace admins, project leads, and assigned users). It supports threaded replies, edit tracking, and soft deletes.

## Schema Structure

```prisma
model Comment {
  id      String @id @default(uuid())
  content String @db.Text
  
  // Relations
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  taskId String
  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  // Threaded replies
  parentCommentId String?
  parentComment   Comment?  @relation("CommentReplies", fields: [parentCommentId], references: [id], onDelete: Cascade)
  replies         Comment[] @relation("CommentReplies")
  
  // Edit tracking
  isEdited  Boolean   @default(false)
  editedAt  DateTime?
  
  // Soft delete
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Indexes
  @@index([taskId])
  @@index([userId])
  @@index([parentCommentId])
  @@index([createdAt])
}
```

## Features

### 1. **Task-Based Messaging**
- Comments are tied to specific tasks
- Enables focused discussions on task details
- Cascade deletes when task is removed

### 2. **User Relations**
- Each comment has an author (User)
- Cascade deletes when user is removed
- Tracks comment history per user

### 3. **Threaded Replies**
- Support for nested conversations
- `parentCommentId` links replies to parent comments
- Unlimited nesting depth (use with caution)
- Cascade deletes replies when parent is deleted

### 4. **Edit Tracking**
- `isEdited` flag indicates if comment was modified
- `editedAt` timestamp records last edit time
- Maintains transparency in conversations

### 5. **Soft Deletes**
- `isDeleted` flag for soft deletion
- `deletedAt` timestamp records deletion time
- Preserves conversation context
- Can be restored if needed

### 6. **Performance Indexes**
- `taskId`: Fast retrieval of all task comments
- `userId`: Quick lookup of user's comments
- `parentCommentId`: Efficient threaded reply queries
- `createdAt`: Chronological sorting

## Authorization Rules

Only the following users can create/view comments on a task:

1. **Workspace Admins** - Full access to all task comments
2. **Project Leads** - Access to all comments in their projects
3. **Assigned Users** - Access to comments on tasks assigned to them

## Usage Examples

### Create a Comment

```typescript
import prisma from "@/lib/db";

// Create a top-level comment
const comment = await prisma.comment.create({
  data: {
    content: "This task needs more details",
    userId: currentUser.id,
    taskId: task.id,
  },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        image: true,
      }
    }
  }
});
```

### Create a Reply (Threaded)

```typescript
// Reply to an existing comment
const reply = await prisma.comment.create({
  data: {
    content: "I'll add more details shortly",
    userId: currentUser.id,
    taskId: task.id,
    parentCommentId: parentComment.id, // Link to parent
  },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        image: true,
      }
    },
    parentComment: true,
  }
});
```

### Get All Comments for a Task

```typescript
// Get all top-level comments with replies
const comments = await prisma.comment.findMany({
  where: {
    taskId: task.id,
    parentCommentId: null, // Only top-level comments
    isDeleted: false, // Exclude soft-deleted
  },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        surname: true,
        image: true,
        email: true,
      }
    },
    replies: {
      where: {
        isDeleted: false,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            image: true,
          }
        }
      },
      orderBy: {
        createdAt: 'asc',
      }
    }
  },
  orderBy: {
    createdAt: 'desc', // Newest first
  }
});
```

### Edit a Comment

```typescript
const updatedComment = await prisma.comment.update({
  where: { id: commentId },
  data: {
    content: "Updated content",
    isEdited: true,
    editedAt: new Date(),
  }
});
```

### Soft Delete a Comment

```typescript
const deletedComment = await prisma.comment.update({
  where: { id: commentId },
  data: {
    isDeleted: true,
    deletedAt: new Date(),
  }
});
```

### Hard Delete a Comment

```typescript
// This will cascade delete all replies
await prisma.comment.delete({
  where: { id: commentId },
});
```

### Check User Authorization

```typescript
async function canUserComment(userId: string, taskId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          workspace: {
            include: {
              members: {
                where: { userId },
                select: { workspaceRole: true }
              }
            }
          },
          projectMembers: {
            where: {
              workspaceMember: { userId }
            },
            select: { projectRole: true }
          }
        }
      },
      assignee: {
        include: {
          workspaceMember: {
            select: { userId: true }
          }
        }
      }
    }
  });

  if (!task) return false;

  // Check if user is workspace admin
  const workspaceMember = task.project.workspace.members[0];
  if (workspaceMember?.workspaceRole === 'ADMIN') return true;

  // Check if user is project lead
  const projectMember = task.project.projectMembers[0];
  if (projectMember?.projectRole === 'LEAD') return true;

  // Check if user is assigned to the task
  if (task.assignee?.workspaceMember?.userId === userId) return true;

  return false;
}
```

## Migration Commands

After adding the Comment model to your schema:

```bash
# Create migration
npx prisma migrate dev --name add_comment_model

# Generate Prisma Client
npx prisma generate

# Push to database (development only)
npx prisma db push
```

## Best Practices

### 1. **Always Check Authorization**
```typescript
if (!await canUserComment(userId, taskId)) {
  throw new Error("Unauthorized to comment on this task");
}
```

### 2. **Use Soft Deletes**
```typescript
// Prefer soft delete over hard delete
// This preserves conversation context
await prisma.comment.update({
  where: { id },
  data: { isDeleted: true, deletedAt: new Date() }
});
```

### 3. **Limit Reply Depth**
```typescript
// Prevent excessive nesting (e.g., max 3 levels)
async function getReplyDepth(commentId: string): Promise<number> {
  let depth = 0;
  let currentId = commentId;
  
  while (currentId) {
    const comment = await prisma.comment.findUnique({
      where: { id: currentId },
      select: { parentCommentId: true }
    });
    
    if (!comment?.parentCommentId) break;
    currentId = comment.parentCommentId;
    depth++;
  }
  
  return depth;
}
```

### 4. **Paginate Comments**
```typescript
// For tasks with many comments
const comments = await prisma.comment.findMany({
  where: { taskId, isDeleted: false },
  take: 20, // Limit
  skip: page * 20, // Offset
  orderBy: { createdAt: 'desc' }
});
```

### 5. **Include User Data**
```typescript
// Always include user info for display
include: {
  user: {
    select: {
      id: true,
      name: true,
      surname: true,
      image: true,
      email: true,
    }
  }
}
```

## TypeScript Types

```typescript
// Comment with user and replies
type CommentWithDetails = {
  id: string;
  content: string;
  userId: string;
  taskId: string;
  parentCommentId: string | null;
  isEdited: boolean;
  editedAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    surname: string | null;
    image: string | null;
    email: string;
  };
  replies?: CommentWithDetails[];
};
```

## Performance Considerations

1. **Indexes**: All critical fields are indexed for fast queries
2. **Cascade Deletes**: Automatic cleanup when tasks/users are deleted
3. **Soft Deletes**: Preserves data while hiding from users
4. **Pagination**: Implement for tasks with many comments
5. **Selective Includes**: Only fetch needed relations

## Security Considerations

1. **Authorization**: Always verify user permissions before CRUD operations
2. **Content Validation**: Sanitize comment content to prevent XSS
3. **Rate Limiting**: Prevent comment spam
4. **Audit Trail**: Track edits and deletions for accountability
5. **Soft Deletes**: Allow recovery from accidental deletions

## Future Enhancements

Potential additions to consider:

1. **Reactions/Likes**: Add emoji reactions to comments
2. **Mentions**: @mention users in comments
3. **Attachments**: Link files/images to comments
4. **Read Receipts**: Track who has read comments
5. **Notifications**: Alert users of new comments
6. **Rich Text**: Support markdown or rich text formatting
7. **Comment Templates**: Pre-defined comment formats
8. **Pinned Comments**: Pin important comments to top
