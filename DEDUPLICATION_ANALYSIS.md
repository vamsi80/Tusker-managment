# Task Data Deduplication Analysis

## 🔍 Duplication Found

### Files Analyzed
- `src/data/task/get-tasks.ts` (283 lines)
- `src/data/task/get-project-tasks.ts` (370 lines)

## 📊 Comparison

| Feature | get-tasks.ts | get-project-tasks.ts |
|---------|--------------|----------------------|
| **Purpose** | Get ALL tasks with nested subtasks | Get paginated tasks with nested subtasks |
| **Pagination** | ❌ No | ✅ Yes (page, pageSize) |
| **Returns** | `{ tasks }` | `{ tasks, totalCount, totalPages, currentPage, hasMore }` |
| **Extra Functions** | None | `_getTaskSubTasksInternal` (subtask pagination) |
| **Usage** | Only exported in index.ts | Used by task-table-container.tsx |
| **Fields Selected** | More fields (includes `id` in nested objects) | Optimized fields |

## 🎯 Recommendation: CONSOLIDATE

### ✅ Keep: `get-project-tasks.ts`
**Reasons:**
1. Has pagination (essential for list view)
2. More optimized field selection
3. Actually being used in the app
4. Has subtask pagination function

### ❌ Delete: `get-tasks.ts`
**Reasons:**
1. No pagination (loads ALL tasks - performance issue)
2. Duplicate logic
3. Only exported, never actually used
4. Less optimized

## 🔧 Optimization Plan

### Step 1: Move to List Folder
```bash
mv src/data/task/get-project-tasks.ts src/data/task/list/get-tasks.ts
```

### Step 2: Remove Unnecessary Fields
Current `get-project-tasks.ts` includes some fields not needed for list view:
- ❌ `createdAt` - Not displayed in list view
- ❌ `updatedAt` - Not displayed in list view  
- ❌ `createdBy.user.id` - Not needed
- ✅ Keep: All other fields (needed for display/actions)

### Step 3: Delete Duplicate
```bash
rm src/data/task/get-tasks.ts
```

### Step 4: Update Exports
Update `src/data/task/index.ts` to export from new location

## 📝 Optimized Structure

```
src/data/task/
├── list/
│   ├── get-tasks.ts          ← Renamed from get-project-tasks.ts
│   ├── get-parent-tasks.ts   ← From get-parent-tasks-only.ts
│   ├── get-subtasks.ts       ← Already exists
│   └── index.ts              ← Barrel exports
├── kanban/
│   └── ... (already organized)
├── gantt/
│   └── get-all-tasks-flat.ts ← Already moved
└── index.ts                  ← Main exports
```

## 🚀 Benefits

1. **Performance**: Pagination prevents loading thousands of tasks
2. **Clarity**: One source of truth for list view tasks
3. **Maintainability**: Changes in one place
4. **Organization**: View-specific folders

## ⚠️ Breaking Changes

None! The function is already being imported directly:
```typescript
import { getProjectTasks } from "@/data/task/get-project-tasks";
```

After move, it will be:
```typescript
import { getProjectTasks } from "@/data/task/list";
// or
import { getProjectTasks } from "@/data/task";
```

## ✅ Action Items

1. ✅ Delete `get-tasks.ts` (unused duplicate)
2. ✅ Keep `get-project-tasks.ts` (used, has pagination)
3. ✅ Move to `list/get-tasks.ts`
4. ✅ Remove unnecessary fields (`createdAt`, `updatedAt`)
5. ✅ Update imports in `task-table-container.tsx`
6. ✅ Update `index.ts` exports
