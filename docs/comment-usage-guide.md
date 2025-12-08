# Comment System Usage Guide

## For Users

### Viewing Comments
1. Click on any subtask name in the task table
2. The Subtask Details Sheet will open on the right side
3. Scroll down to the "Activity" section to see all comments
4. Comments are displayed in chronological order (oldest first)

### Adding a Comment
1. Open the subtask details sheet
2. Scroll to the bottom of the Activity section
3. Type your message in the input field
4. Press **Enter** or click the **↑ send button**
5. Your comment will appear immediately in the chat

### Comment Display
- **Your comments**: Appear on the right side with a blue/purple background
- **Other users' comments**: Appear on the left side with a gray background and show the user's avatar and name
- **Timestamps**: Displayed below each comment
- **Edited comments**: Show "(edited)" next to the timestamp

### Loading States
- **Loading comments**: A spinner appears while fetching comments
- **Sending comment**: The send button shows a spinner while submitting
- **Empty state**: "No comments yet. Start the conversation!" message when there are no comments

## For Developers

### Adding Comment Functionality to Other Components

#### 1. Import Required Dependencies
```tsx
import { createTaskComment, fetchTaskComments } from "@/app/actions/comment-actions";
import { toast } from "sonner";
```

#### 2. Set Up State
```tsx
const [comments, setComments] = useState<Comment[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [isSending, setIsSending] = useState(false);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

#### 3. Fetch Comments
```tsx
const loadComments = async () => {
    if (!taskId) return;
    
    setIsLoading(true);
    try {
        const result = await fetchTaskComments(taskId);
        if (result.success && result.comments) {
            setComments(result.comments);
            if (result.currentUserId) {
                setCurrentUserId(result.currentUserId);
            }
        } else {
            toast.error(result.error || "Failed to load comments");
        }
    } catch (error) {
        console.error("Error loading comments:", error);
        toast.error("Failed to load comments");
    } finally {
        setIsLoading(false);
    }
};
```

#### 4. Create a Comment
```tsx
const handleSendMessage = async () => {
    if (!message.trim() || !taskId) return;
    
    setIsSending(true);
    try {
        const result = await createTaskComment(taskId, message.trim());
        
        if (result.success && result.comment) {
            setComments([...comments, result.comment]);
            setMessage("");
            toast.success("Comment added successfully");
        } else {
            toast.error(result.error || "Failed to add comment");
        }
    } catch (error) {
        console.error("Error sending message:", error);
        toast.error("Failed to send message");
    } finally {
        setIsSending(false);
    }
};
```

### Available Server Actions

#### `fetchTaskComments(taskId: string)`
Fetches all comments for a task.

**Returns:**
```typescript
{
    success: boolean;
    comments?: Comment[];
    currentUserId?: string;
    error?: string;
}
```

#### `createTaskComment(taskId: string, content: string)`
Creates a new comment on a task.

**Returns:**
```typescript
{
    success: boolean;
    comment?: Comment;
    error?: string;
}
```

#### `createCommentReply(taskId: string, parentCommentId: string, content: string)`
Creates a reply to an existing comment.

**Returns:**
```typescript
{
    success: boolean;
    comment?: Comment;
    error?: string;
}
```

#### `updateComment(commentId: string, newContent: string)`
Edits an existing comment (user must be the owner).

**Returns:**
```typescript
{
    success: boolean;
    comment?: Comment;
    error?: string;
}
```

#### `removeComment(commentId: string)`
Soft deletes a comment (user must be the owner).

**Returns:**
```typescript
{
    success: boolean;
    error?: string;
}
```

### Comment Type Definition
```typescript
interface Comment {
    id: string;
    content: string;
    userId: string;
    taskId: string;
    user: {
        id: string;
        name: string;
        surname: string | null;
        email: string;
        image: string | null;
    };
    isEdited: boolean;
    editedAt: Date | null;
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    replies?: Comment[];
}
```

### Authorization Rules
Comments are subject to the following authorization rules (enforced in `comment-helpers.ts`):

1. **Who can comment:**
   - Workspace admins
   - Project leads
   - Users assigned to the task

2. **Who can edit/delete:**
   - Only the comment owner can edit or delete their own comments

3. **Reply depth:**
   - Maximum of 5 levels of nested replies to prevent infinite nesting

### Error Handling
All server actions include comprehensive error handling:
- Authentication validation
- Authorization checks
- Database error handling
- User-friendly error messages via toast notifications

### Cache Management
The comment system automatically revalidates the task page cache when:
- A new comment is created
- A comment is edited
- A comment is deleted

This ensures that all users see the most up-to-date comments.

## Troubleshooting

### Comments Not Loading
1. Check browser console for errors
2. Verify the user is authenticated
3. Ensure the task ID is valid
4. Check database connection

### Cannot Send Comments
1. Verify the user has permission to comment on the task
2. Check that the message is not empty
3. Ensure the task exists in the database
4. Check server logs for authorization errors

### Comments Not Updating
1. Clear browser cache
2. Refresh the page
3. Check if cache revalidation is working
4. Verify the server action is returning success

## Future Enhancements
- [ ] Real-time updates using WebSockets
- [ ] Rich text formatting
- [ ] File attachments
- [ ] @mentions
- [ ] Reactions/likes
- [ ] Comment search
- [ ] Comment notifications
- [ ] Threaded replies UI
