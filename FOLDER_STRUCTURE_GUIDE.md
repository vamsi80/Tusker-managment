# Task Components Folder Structure Reorganization Guide

## 📁 Current Structure (Messy)
```
_components/
├── forms/
├── kanban/
├── list/
├── layout folder/ (empty - DELETE THIS)
├── shared/ (empty)
├── subtask-details-sheet.tsx
├── task-page-skeleton.tsx
├── task-page-wrapper.tsx
├── task-context.tsx
├── reload-button.tsx
├── task-table.tsx
├── task-table-container.tsx
└── reloadable-task-table.tsx
```

## ✅ Target Structure (Clean & Organized)
```
_components/
├── shared/              # Shared components used across all views
│   ├── subtask-details-sheet.tsx
│   ├── task-page-skeleton.tsx
│   ├── task-page-wrapper.tsx
│   ├── task-context.tsx
│   └── reload-button.tsx
│
├── list/                # List view specific components
│   ├── task-table.tsx
│   ├── task-table-container.tsx
│   ├── task-table-toolbar.tsx
│   ├── task-row.tsx
│   ├── subtask-list.tsx
│   ├── subtask-row.tsx
│   ├── reloadable-task-table.tsx
│   └── types.ts
│
├── kanban/              # Kanban view specific components
│   ├── kanban-container.tsx
│   ├── kanban-board.tsx
│   └── kanban-card.tsx
│
└── forms/               # All form components
    ├── create-task-form.tsx
    ├── create-subTask-form.tsx
    ├── edit-task-form.tsx
    ├── edit-subtask-form.tsx
    ├── delete-task-form.tsx
    ├── delete-subtask-form.tsx
    ├── bulk-create-task-form.tsx
    └── bulk-create-subtask-form.tsx
```

## 🔧 Manual Steps to Reorganize

### Step 1: Move files to `shared/` folder
Move these files from `_components/` to `_components/shared/`:
- subtask-details-sheet.tsx
- task-page-skeleton.tsx
- task-page-wrapper.tsx
- task-context.tsx
- reload-button.tsx

### Step 2: Move files to `list/` folder
Move these files from `_components/` to `_components/list/`:
- task-table.tsx
- task-table-container.tsx
- reloadable-task-table.tsx

### Step 3: Delete empty folder
- Delete the `layout folder` directory (it's empty)

### Step 4: Update Import Paths

#### In `page.tsx`:
```tsx
// OLD imports
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/task-page-skeleton";
import { TaskPageWrapper } from "./_components/task-page-wrapper";
import { TaskTableContainer } from "./_components/task-table-container";
import { ReloadButton } from "./_components/reload-button";
import { ReloadableTaskTable } from "./_components/reloadable-task-table";

// NEW imports
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/shared/task-page-skeleton";
import { TaskPageWrapper } from "./_components/shared/task-page-wrapper";
import { TaskTableContainer } from "./_components/list/task-table-container";
import { ReloadButton } from "./_components/shared/reload-button";
import { ReloadableTaskTable } from "./_components/list/reloadable-task-table";
```

#### In `task-table.tsx` (inside list/ folder):
```tsx
// OLD imports
import { TaskTableToolbar, ColumnVisibility } from "./list/task-table-toolbar";
import { TaskRow } from "./list/task-row";
import { SubTaskList } from "./list/subtask-list";
import { TaskWithSubTasks } from "./list/types";
import { SubTaskDetailsSheet } from "./subtask-details-sheet";
import { useNewTask } from "./task-page-wrapper";

// NEW imports
import { TaskTableToolbar, ColumnVisibility } from "./task-table-toolbar";
import { TaskRow } from "./task-row";
import { SubTaskList } from "./subtask-list";
import { TaskWithSubTasks } from "./types";
import { SubTaskDetailsSheet } from "../shared/subtask-details-sheet";
import { useNewTask } from "../shared/task-page-wrapper";
```

#### In `task-table-container.tsx` (inside list/ folder):
```tsx
// OLD import
import { TaskTable } from "./task-table";

// NEW import (stays the same since it's in the same folder)
import { TaskTable } from "./task-table";
```

#### In `reloadable-task-table.tsx` (inside list/ folder):
```tsx
// OLD import
import { useTaskReload } from "./task-context";

// NEW import
import { useTaskReload } from "../shared/task-context";
```

#### In `reload-button.tsx` (inside shared/ folder):
```tsx
// OLD import
import { useTaskReload } from "./task-context";

// NEW import (stays the same since it's in the same folder)
import { useTaskReload } from "./task-context";
```

#### In `subtask-list.tsx` (inside list/ folder):
```tsx
// OLD import
import { CreateSubTaskForm } from "../forms/create-subTask-form";

// NEW import (stays the same)
import { CreateSubTaskForm } from "../forms/create-subTask-form";
```

#### In `subtask-row.tsx` (inside list/ folder):
```tsx
// OLD imports
import { EditSubTaskForm } from "../forms/edit-subtask-form";
import { DeleteSubTaskForm } from "../forms/delete-subtask-form";

// NEW imports (stay the same)
import { EditSubTaskForm } from "../forms/edit-subtask-form";
import { DeleteSubTaskForm } from "../forms/delete-subtask-form";
```

## 📊 Benefits of This Structure

1. **Clear Separation of Concerns**
   - `shared/` - Components used by multiple views
   - `list/` - List view specific components
   - `kanban/` - Kanban view specific components
   - `forms/` - All form components in one place

2. **Easier Navigation**
   - Developers can quickly find components
   - Related components are grouped together

3. **Better Scalability**
   - Easy to add new views (e.g., `gantt/` folder)
   - Clear pattern to follow

4. **Reduced Cognitive Load**
   - No more guessing where files belong
   - Consistent import paths

## 🎯 Quick Reference

| Component Type | Location | Example |
|---------------|----------|---------|
| Shared UI | `shared/` | subtask-details-sheet.tsx |
| List View | `list/` | task-table.tsx |
| Kanban View | `kanban/` | kanban-board.tsx |
| Forms | `forms/` | create-task-form.tsx |
| Types | `list/types.ts` | TaskWithSubTasks |

---

**Note**: After reorganizing, restart your TypeScript server in VS Code:
- Press `Ctrl+Shift+P`
- Type "TypeScript: Restart TS Server"
- Press Enter

This will ensure all import paths are correctly resolved.
