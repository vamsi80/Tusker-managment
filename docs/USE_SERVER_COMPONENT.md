# ✅ SOLUTION: Use Server Component for Reading Comments

## Problem

Currently, when opening the subtask details sheet, it makes **POST requests** to fetch comments:
```
POST /w/.../p/.../task?view=list&subtask=... 200 in 3765ms
```

This is wrong because:
- ❌ Reading data should use GET (or direct data layer calls)
- ❌ POST is for creating/updating data
- ❌ Unnecessary HTTP overhead

## Solution

Use the **`SubTaskDetailsServer`** component instead of `SubTaskDetailsSheet` directly!

### ✅ Correct Usage

**Before** (Wrong - Uses POST):
```tsx
// In your parent component
<SubTaskDetailsSheet 
    subTask={subTask}
    isOpen={isOpen}
    onClose={onClose}
/>
```

**After** (Correct - Uses Data Layer):
```tsx
// In your parent component (must be server component)
<SubTaskDetailsServer 
    subTask={subTask}
    isOpen={isOpen}
    onClose={onClose}
/>
```

## How It Works

### Server Component Flow (No POST!)

```
SubTaskDetailsServer (Server Component)
    ↓
Calls getTaskComments() directly
Calls getReviewComments() directly
    ↓
Data Layer (src/data/comments/)
    ↓ Cached, optimized
Database
    ↓ Props passed down
SubTaskDetailsSheet (Client Component)
    ↓ Receives initial data
    ↓ No need to fetch on mount!
```

### What Happens

1. **Server Component** fetches data using data layer
   - Direct database access
   - Cached with `unstable_cache`
   - **No HTTP requests**

2. **Client Component** receives data as props
   - `initialComments` - Already loaded
   - `initialReviewComments` - Already loaded
   - `currentUserId` - Already set

3. **Only POST for mutations**
   - Creating comments → `createTaskCommentAction()` (POST - correct!)
   - Updating comments → `updateCommentAction()` (POST - correct!)

## Files

### Server Wrapper
**File**: `src/app/w/[workspaceId]/p/[slug]/task/_components/shared/subtask-details-server.tsx`

```tsx
export async function SubTaskDetailsServer({ subTask, isOpen, onClose }) {
    // Fetch using data layer (no POST!)
    const [comments, reviewComments] = await Promise.all([
        getTaskComments(subTask.id),        // ✅ Direct DB call
        getReviewComments(subTask.id),      // ✅ Direct DB call
    ]);
    
    return (
        <SubTaskDetailsSheet 
            subTask={subTask}
            isOpen={isOpen}
            onClose={onClose}
            initialComments={comments}           // ✅ Pass as props
            initialReviewComments={reviewComments} // ✅ Pass as props
            currentUserId={currentUserId}
        />
    );
}
```

### Client Component
**File**: `src/app/w/[workspaceId]/p/[slug]/task/_components/shared/subtask-details-sheet.tsx`

```tsx
export function SubTaskDetailsSheet({ 
    subTask, 
    isOpen, 
    onClose,
    initialComments = [],          // ✅ Receives from server
    initialReviewComments = [],    // ✅ Receives from server
    currentUserId = null,
}) {
    // Initialize with provided data
    const [comments, setComments] = useState(initialComments);
    const [reviewComments, setReviewComments] = useState(initialReviewComments);
    
    // Only fetch if initial data wasn't provided
    useEffect(() => {
        if (initialComments.length === 0) {
            loadComments(); // Fallback to POST
        }
    }, []);
    
    // ... rest of component
}
```

## Migration Steps

### Step 1: Find Where SubTaskDetailsSheet is Used

Search for:
```tsx
<SubTaskDetailsSheet
```

### Step 2: Replace with Server Wrapper

Change to:
```tsx
<SubTaskDetailsServer
```

### Step 3: Ensure Parent is Server Component

The parent component must be a server component (no `"use client"` directive).

If parent is client component, you'll need to create a server wrapper for it too.

## Example Migration

### Before
```tsx
// some-page.tsx
"use client"; // ❌ Client component

export function SomePage() {
    return (
        <SubTaskDetailsSheet 
            subTask={subTask}
            isOpen={isOpen}
            onClose={onClose}
        />
    );
}
```

### After
```tsx
// some-page.tsx
// ✅ Server component (no "use client")

export async function SomePage() {
    return (
        <SubTaskDetailsServer 
            subTask={subTask}
            isOpen={isOpen}
            onClose={onClose}
        />
    );
}
```

## Benefits

### ✅ No POST Requests for Reading
- Server component fetches directly from data layer
- No HTTP overhead
- Faster performance

### ✅ Proper Caching
- Data layer uses `unstable_cache`
- Automatic revalidation
- Better performance

### ✅ Correct HTTP Semantics
- GET (data layer) for reading
- POST (server actions) for writing

## Network Tab

### Before (Wrong)
```
POST /w/.../task?subtask=...  200 in 3765ms  ❌
POST /w/.../task?subtask=...  200 in 2341ms  ❌
```

### After (Correct)
```
(No HTTP requests - server-side data fetching)  ✅
```

Only POST when creating comments:
```
POST /_next/data/...  (createCommentAction)  ✅
```

## Summary

✅ **Use `SubTaskDetailsServer`** for reading comments
✅ **Server component** fetches from data layer
✅ **No POST requests** for reading
✅ **Only POST** for mutations (create/update)

**Result: Proper HTTP semantics and better performance! 🚀**

---

## Quick Reference

| Action | Component | Method | Correct? |
|--------|-----------|--------|----------|
| **Open sheet (read)** | `SubTaskDetailsServer` | Data Layer (Direct) | ✅ |
| **Create comment** | `SubTaskDetailsSheet` | Server Action (POST) | ✅ |
| **Update comment** | `SubTaskDetailsSheet` | Server Action (POST) | ✅ |
| **Delete comment** | `SubTaskDetailsSheet` | Server Action (POST) | ✅ |

**Key Takeaway**: Reading = Server Component, Writing = Server Action
