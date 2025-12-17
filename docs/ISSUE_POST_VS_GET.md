# Issue: Using POST Instead of GET for Data Fetching

## 🐛 Problem

Currently, when **reading/viewing data** (like expanding tasks, loading comments), the application is using **POST requests** via server actions. This is incorrect because:

### HTTP Method Best Practices
- **GET**: For reading/fetching data (idempotent, cacheable)
- **POST**: For creating/modifying data (non-idempotent)

### Current Issues

#### 1. **Task Table - Expanding Tasks**
```tsx
// ❌ WRONG: Using POST via server action
const result = await loadTasksAction(projectId, workspaceId, nextPage, 10);
const result = await loadSubTasksAction(taskId, workspaceId, projectId, 1, 10);
```

**Problem**: When user expands a task to view subtasks, it makes a POST request instead of GET.

#### 2. **Comment Fetching**
```tsx
// ❌ WRONG: Using POST via server action wrapper
const result = await fetchCommentsAction(subTask.id);
const result = await fetchReviewCommentsAction(subTask.id);
```

**Problem**: When opening subtask sheet to view comments, it makes POST requests.

## ✅ Solution

### Architectural Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT COMPONENT                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  READ Operations (GET)          WRITE Operations (POST)      │
│  ├─ fetch('/api/...')           ├─ serverAction()           │
│  ├─ GET request                 ├─ POST request             │
│  ├─ Cacheable                   ├─ Mutates data             │
│  └─ Idempotent                  └─ Cache invalidation       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Plan

#### 1. **Create GET API Routes for Data Fetching**

**File Structure**:
```
src/app/api/
├── tasks/
│   ├── route.ts                    # GET /api/tasks?projectId=...&page=...
│   └── [taskId]/
│       └── subtasks/
│           └── route.ts            # GET /api/tasks/[taskId]/subtasks?page=...
└── comments/
    ├── route.ts                    # GET /api/comments?taskId=...
    └── review/
        └── route.ts                # GET /api/comments/review?subTaskId=...
```

#### 2. **Update Client Components to Use fetch()**

**Task Table** (`task-table.tsx`):
```tsx
// ✅ CORRECT: Use GET via fetch
const loadMoreTasks = async () => {
    const response = await fetch(
        `/api/tasks?projectId=${projectId}&workspaceId=${workspaceId}&page=${nextPage}&limit=10`
    );
    const result = await response.json();
    // ... handle result
};

const toggleExpand = async (taskId: string) => {
    const response = await fetch(
        `/api/tasks/${taskId}/subtasks?workspaceId=${workspaceId}&projectId=${projectId}&page=1&limit=10`
    );
    const result = await response.json();
    // ... handle result
};
```

**Subtask Details Sheet** (`subtask-details-sheet.tsx`):
```tsx
// ✅ CORRECT: Use GET via fetch
const loadComments = async () => {
    const response = await fetch(`/api/comments?taskId=${subTask.id}`);
    const result = await response.json();
    // ... handle result
};

const loadReviewComments = async () => {
    const response = await fetch(`/api/comments/review?subTaskId=${subTask.id}`);
    const result = await response.json();
    // ... handle result
};
```

#### 3. **Keep Server Actions for Mutations**

**Keep POST for**:
- Creating comments: `createCommentAction()`
- Updating comments: `updateCommentAction()`
- Deleting comments: `deleteCommentAction()`
- Creating tasks: `createTaskAction()`
- Updating tasks: `updateTaskAction()`

## 📊 Comparison

### Before (Incorrect)
| Action | Method | Route | Correct? |
|--------|--------|-------|----------|
| View tasks | POST | Server Action | ❌ |
| Expand task | POST | Server Action | ❌ |
| View comments | POST | Server Action | ❌ |
| Create comment | POST | Server Action | ✅ |

### After (Correct)
| Action | Method | Route | Correct? |
|--------|--------|-------|----------|
| View tasks | GET | `/api/tasks` | ✅ |
| Expand task | GET | `/api/tasks/[id]/subtasks` | ✅ |
| View comments | GET | `/api/comments` | ✅ |
| Create comment | POST | Server Action | ✅ |

## 🎯 Benefits of Using GET

1. **Proper HTTP Semantics**
   - GET for reading (idempotent)
   - POST for writing (non-idempotent)

2. **Caching**
   - Browser can cache GET requests
   - CDN can cache GET responses
   - Better performance

3. **SEO & Crawling**
   - Search engines understand GET
   - Better for analytics

4. **Developer Tools**
   - Easier to debug in Network tab
   - Can copy/paste URLs
   - Can refresh/bookmark

5. **Standards Compliance**
   - Follows REST principles
   - Better API design

## 🚀 Implementation Steps

1. ✅ Create API routes for tasks
2. ✅ Create API routes for comments
3. ✅ Update task-table.tsx to use fetch()
4. ✅ Update subtask-details-sheet.tsx to use fetch()
5. ✅ Remove unused server action wrappers
6. ✅ Test all data fetching scenarios
7. ✅ Verify GET requests in Network tab

## 📝 Files to Create/Update

### New API Routes
- `src/app/api/tasks/route.ts`
- `src/app/api/tasks/[taskId]/subtasks/route.ts`
- `src/app/api/comments/route.ts`
- `src/app/api/comments/review/route.ts`

### Update Client Components
- `src/app/w/[workspaceId]/p/[slug]/task/_components/list/task-table.tsx`
- `src/app/w/[workspaceId]/p/[slug]/task/_components/shared/subtask-details-sheet.tsx`

### Remove (After Migration)
- `src/actions/comment/fetch-comments.ts` (wrapper not needed)
- `src/actions/comment/fetch-review-comments.ts` (wrapper not needed)

## 🎉 Expected Result

After implementation:
- ✅ **Expanding tasks**: GET request to `/api/tasks/[id]/subtasks`
- ✅ **Loading more tasks**: GET request to `/api/tasks`
- ✅ **Viewing comments**: GET request to `/api/comments`
- ✅ **Creating comments**: POST via server action (correct!)

**Network Tab Should Show**:
```
GET  /api/tasks?projectId=...&page=2              200 OK
GET  /api/tasks/abc123/subtasks?page=1            200 OK
GET  /api/comments?taskId=xyz789                  200 OK
POST /_next/data/...  (only for mutations)        200 OK
```

---

**Status**: 🔴 **Issue Identified - Implementation Needed**

**Priority**: 🔥 **High** - Incorrect HTTP method usage
