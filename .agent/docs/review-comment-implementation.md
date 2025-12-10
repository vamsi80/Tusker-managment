# Review Comment Requirement Implementation

## Overview
This implementation ensures that when a user moves a subtask or task to the **REVIEW** state, they must provide either a **comment** or an **attachment**. If the user cancels the dialog or fails to provide the required information, the subtask/task reverts to its original state.

## Components Created

### 1. ReviewCommentDialog Component
**Location:** `src/app/w/[workspaceId]/p/[slug]/task/_components/kanban/review-comment-dialog.tsx`

**Features:**
- Modal dialog that appears when moving to REVIEW status
- Requires either a comment text or file attachment
- File upload with validation (max 10MB)
- Supports: Images, PDF, Word, Excel files
- Cancel button to abort the move (reverts status)
- Submit button (disabled until comment or attachment provided)

### 2. Create Review Comment Server Action
**Location:** `src/app/w/[workspaceId]/p/[slug]/task/_components/kanban/actions/create-review-comment.ts`

**Features:**
- Server-side validation of permissions
- Verifies subtask belongs to the project
- Stores comment text and optional attachment (as base64 in JSON)
- Returns review comment ID for linking to status update

### 3. Updated Status Update Server Action
**Location:** `src/app/w/[workspaceId]/p/[slug]/task/_components/kanban/actions/subtask-status-actions.ts`

**Changes:**
- Added `reviewCommentId` parameter
- Validates that review comment exists when moving to REVIEW
- Ensures review comment belongs to the subtask
- Returns error if no review comment provided for REVIEW status

### 4. Updated Kanban Board
**Location:** `src/app/w/[workspaceId]/p/[slug]/task/_components/kanban/kanban-board.tsx`

**Changes:**
- Added state for review comment dialog
- Intercepts drag-and-drop to REVIEW status
- Shows dialog before completing the move
- Handles file-to-base64 conversion
- Creates review comment first, then updates status
- Rolls back optimistic UI update if user cancels or operation fails

## User Flow

1. **User drags subtask to REVIEW column**
   - Optimistic UI update shows card in REVIEW column immediately
   - Review comment dialog appears

2. **User adds comment and/or attachment**
   - Comment text is optional if attachment provided
   - Attachment is optional if comment text provided
   - At least one must be provided

3. **User clicks "Submit & Move to Review"**
   - File is converted to base64 (if provided)
   - Review comment is created via server action
   - Status update is performed with review comment ID
   - Success toast is shown

4. **User clicks "Cancel"**
   - Optimistic UI update is rolled back
   - Card returns to original column
   - No data is saved

## Database Schema

The implementation uses the existing `ReviewComment` model:

```prisma
model ReviewComment {
  id        String @id @default(uuid())
  subTaskId String
  subTask   Task   @relation(fields: [subTaskId], references: [id], onDelete: Cascade)

  authorId String
  author   WorkspaceMember @relation(fields: [authorId], references: [id], onDelete: Cascade)

  text       String
  attachment Json?  // Stores file metadata and base64 data

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([subTaskId, createdAt])
}
```

## Security & Validation

### Client-Side
- File size validation (max 10MB)
- File type validation (images, PDF, Word, Excel)
- Required field validation (comment OR attachment)

### Server-Side
- User authentication required
- Permission validation (workspace member)
- Subtask ownership verification
- Review comment validation when moving to REVIEW
- Idempotency support via operation ID

## Error Handling

1. **No comment or attachment provided**
   - Dialog shows error toast
   - Submit button remains disabled

2. **File too large**
   - Toast error shown
   - File is not attached

3. **Server error creating review comment**
   - Optimistic UI update is rolled back
   - Error toast shown
   - User can retry

4. **Server error updating status**
   - Optimistic UI update is rolled back
   - Error toast shown
   - Review comment remains in database (can be cleaned up later)

## Testing Checklist

- [ ] Move subtask to REVIEW without comment/attachment (should show error)
- [ ] Move subtask to REVIEW with only comment (should succeed)
- [ ] Move subtask to REVIEW with only attachment (should succeed)
- [ ] Move subtask to REVIEW with both comment and attachment (should succeed)
- [ ] Cancel review dialog (should revert to original status)
- [ ] Upload file larger than 10MB (should show error)
- [ ] Upload unsupported file type (should be blocked by input)
- [ ] Test with different user permissions
- [ ] Test network error scenarios
- [ ] Test optimistic UI rollback

## Future Enhancements

1. **Display review comments in subtask details**
   - Show all review comments in the SubTaskDetailsSheet
   - Allow viewing attachments
   - Show comment author and timestamp

2. **Edit/Delete review comments**
   - Allow comment authors to edit their comments
   - Allow admins to delete inappropriate comments

3. **Attachment storage**
   - Move from base64 in database to cloud storage (S3, Cloudinary)
   - Generate thumbnails for images
   - Implement download functionality

4. **Notifications**
   - Notify assignee when subtask moved to REVIEW
   - Notify reviewers when comment added

5. **Rich text editor**
   - Replace textarea with rich text editor
   - Support markdown formatting
   - @mention other team members
