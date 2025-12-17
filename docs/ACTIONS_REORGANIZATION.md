# Actions Folder Reorganization

## Summary
Moved task loading server actions from component-level folder to centralized actions folder.

## Changes Made

### Files Moved
```
FROM: src/app/w/[workspaceId]/p/[slug]/task/_components/list/actions/
TO:   src/actions/task/

Files:
✅ load-tasks.ts
✅ load-subtasks.ts
```

### Updated Imports
Updated `task-table.tsx` to use new import paths:
```typescript
// OLD
import { loadTasksAction } from "./actions/load-tasks";
import { loadSubTasksAction } from "./actions/load-subtasks";

// NEW
import { loadTasksAction } from "@/actions/task/load-tasks";
import { loadSubTasksAction } from "@/actions/task/load-subtasks";
```

## Folder Structure

### Before
```
src/
├── actions/
│   └── task/
│       ├── create-task.ts
│       ├── update-task.ts
│       ├── delete-task.ts
│       ├── create-subTask.ts
│       ├── update-subTask.ts
│       ├── delete-subTask.ts
│       └── bulk-create-taskAndSubTask.ts
│
└── app/
    └── w/[workspaceId]/p/[slug]/task/_components/
        └── list/
            └── actions/          ← Component-specific actions
                ├── load-tasks.ts
                └── load-subtasks.ts
```

### After
```
src/
└── actions/
    └── task/
        ├── create-task.ts
        ├── update-task.ts
        ├── delete-task.ts
        ├── create-subTask.ts
        ├── update-subTask.ts
        ├── delete-subTask.ts
        ├── bulk-create-taskAndSubTask.ts
        ├── load-tasks.ts         ← Moved here
        └── load-subtasks.ts      ← Moved here
```

## Rationale

### ✅ Benefits of Centralized Actions

1. **Single Source of Truth**
   - All task-related server actions in one place
   - Easier to find and maintain
   - Consistent organization

2. **Better Reusability**
   - Actions can be used by any component
   - Not tied to specific component structure
   - Easier to import from anywhere

3. **Clearer Separation of Concerns**
   ```
   src/data/       → Data fetching (database queries)
   src/actions/    → Server actions (mutations + queries)
   src/app/        → UI components
   ```

4. **Follows Next.js Best Practices**
   - Server actions in dedicated folder
   - Not mixed with component code
   - Clear "use server" boundaries

5. **Easier Testing**
   - Actions isolated from components
   - Can be tested independently
   - Mocking is simpler

## Action Types in src/actions/task/

### CRUD Operations (Mutations)
- `create-task.ts` - Create parent tasks
- `create-subTask.ts` - Create subtasks
- `update-task.ts` - Update parent tasks
- `update-subTask.ts` - Update subtasks
- `delete-task.ts` - Delete parent tasks
- `delete-subTask.ts` - Delete subtasks
- `bulk-create-taskAndSubTask.ts` - Bulk operations

### Data Loading (Queries)
- `load-tasks.ts` - Load parent tasks with pagination
- `load-subtasks.ts` - Load subtasks with pagination

## Import Pattern

All components should now import from centralized location:

```typescript
// ✅ CORRECT
import { loadTasksAction } from "@/actions/task/load-tasks";
import { loadSubTasksAction } from "@/actions/task/load-subtasks";
import { createTask } from "@/actions/task/create-task";
import { updateTask } from "@/actions/task/update-task";

// ❌ WRONG (old pattern)
import { loadTasksAction } from "./actions/load-tasks";
import { loadSubTasksAction } from "../actions/load-subtasks";
```

## Future Considerations

### Potential Index File
Consider creating `src/actions/task/index.ts` for cleaner imports:

```typescript
// src/actions/task/index.ts
export { createTask } from "./create-task";
export { updateTask } from "./update-task";
export { deleteTask } from "./delete-task";
export { createSubTask } from "./create-subTask";
export { updateSubTask } from "./update-subTask";
export { deleteSubTask } from "./delete-subTask";
export { loadTasksAction } from "./load-tasks";
export { loadSubTasksAction } from "./load-subtasks";
export { bulkCreateTaskAndSubTask } from "./bulk-create-taskAndSubTask";
```

Then components can import like:
```typescript
import { 
    loadTasksAction, 
    loadSubTasksAction,
    createTask,
    updateTask 
} from "@/actions/task";
```

## Files Modified

1. ✅ Created: `src/actions/task/load-tasks.ts`
2. ✅ Created: `src/actions/task/load-subtasks.ts`
3. ✅ Updated: `src/app/w/[workspaceId]/p/[slug]/task/_components/list/task-table.tsx`
4. ✅ Deleted: `src/app/w/[workspaceId]/p/[slug]/task/_components/list/actions/` (entire folder)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│                                                             │
│  Components (src/app/)                                      │
│  ├─ task-table.tsx                                         │
│  ├─ kanban-board.tsx                                       │
│  └─ gantt-container.tsx                                    │
│                                                             │
└─────────────────┬───────────────────────────────────────────┘
                  │ imports
                  ↓
┌─────────────────────────────────────────────────────────────┐
│                    Actions Layer                            │
│                                                             │
│  Server Actions (src/actions/task/)                        │
│  ├─ load-tasks.ts         ← Query actions                 │
│  ├─ load-subtasks.ts      ← Query actions                 │
│  ├─ create-task.ts        ← Mutation actions              │
│  ├─ update-task.ts        ← Mutation actions              │
│  └─ delete-task.ts        ← Mutation actions              │
│                                                             │
└─────────────────┬───────────────────────────────────────────┘
                  │ calls
                  ↓
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                              │
│                                                             │
│  Data Fetching (src/data/task/)                            │
│  ├─ get-parent-tasks-only.ts                              │
│  ├─ get-subtasks.ts                                        │
│  ├─ get-all-tasks-flat.ts                                 │
│  └─ get-task-by-id.ts                                     │
│                                                             │
└─────────────────┬───────────────────────────────────────────┘
                  │ queries
                  ↓
┌─────────────────────────────────────────────────────────────┐
│                    Database (Prisma)                        │
└─────────────────────────────────────────────────────────────┘
```

## Conclusion

✅ **Reorganization Complete**

All task-related server actions are now centralized in `src/actions/task/`, following Next.js best practices and improving code organization, reusability, and maintainability.
