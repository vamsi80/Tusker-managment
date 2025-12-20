# Task Data Folder Structure - Perfect Organization

## 📁 Recommended Folder Structure

```
src/data/task/
├── 📁 kanban/                    # Kanban view specific
│   ├── get-all-subtasks.ts      # ✅ Already exists
│   ├── get-subtasks-by-status.ts # ✅ Already exists
│   └── index.ts                  # ✅ Already exists
│
├── 📁 list/                      # List/Table view specific
│   ├── get-parent-tasks.ts      # 🔄 Move from root
│   ├── get-subtasks.ts           # 🔄 Move from root
│   ├── get-all-tasks-flat.ts    # 🔄 Move from root
│   └── index.ts                  # ✨ Create new
│
├── 📁 gantt/                     # Gantt view specific
│   ├── get-gantt-tasks.ts       # ✨ Create new (or move if exists)
│   └── index.ts                  # ✨ Create new
│
├── 📁 shared/                    # Shared utilities across views
│   ├── get-task-by-id.ts        # 🔄 Move from root
│   ├── get-project-tasks.ts     # 🔄 Move from root
│   ├── get-workspace-tasks.ts   # 🔄 Move from root
│   ├── get-task-page-data.ts    # 🔄 Move from root
│   ├── revalidate-task-data.ts  # 🔄 Move from root
│   └── index.ts                  # ✨ Create new
│
├── get-tasks.ts                  # 🟢 Keep (generic task fetcher)
└── index.ts                      # 🔄 Update exports
```

---

## 📋 File Classification

### 🔵 **Kanban View Files** (Already organized ✅)
- `kanban/get-all-subtasks.ts` - Fetch all subtasks for kanban board
- `kanban/get-subtasks-by-status.ts` - Fetch subtasks by status column
- `kanban/index.ts` - Kanban exports

### 🟢 **List/Table View Files** (Need to move)
- `get-parent-tasks-only.ts` → `list/get-parent-tasks.ts`
- `get-subtasks.ts` → `list/get-subtasks.ts`
- `get-all-tasks-flat.ts` → `list/get-all-tasks-flat.ts`

### 🟡 **Gantt View Files** (Need to create/organize)
- Create `gantt/get-gantt-tasks.ts` (if you have gantt-specific logic)
- Or move existing gantt files here

### 🟠 **Shared/Global Files** (Need to move)
- `get-task-by-id.ts` → `shared/get-task-by-id.ts` (used by all views)
- `get-project-tasks.ts` → `shared/get-project-tasks.ts` (project-level data)
- `get-workspace-tasks.ts` → `shared/get-workspace-tasks.ts` (workspace-level data)
- `get-task-page-data.ts` → `shared/get-task-page-data.ts` (page initialization)
- `revalidate-task-data.ts` → `shared/revalidate-task-data.ts` (cache management)

### 🔴 **Keep at Root**
- `get-tasks.ts` - Generic task fetcher (can be used by any view)
- `index.ts` - Main export file

---

## 🎯 Benefits of This Structure

### **1. Clear Separation of Concerns**
```
✅ Each view has its own folder
✅ Shared code is in one place
✅ Easy to find view-specific logic
```

### **2. Better Maintainability**
```
✅ Changes to kanban don't affect list view
✅ Changes to list don't affect gantt view
✅ Shared code updates benefit all views
```

### **3. Easier Onboarding**
```
✅ New developers know where to look
✅ Clear naming conventions
✅ Logical organization
```

### **4. Scalability**
```
✅ Easy to add new views (calendar, timeline, etc.)
✅ Each view can have its own optimizations
✅ No file naming conflicts
```

---

## 📝 Migration Plan

### **Step 1: Create Shared Folder**
```bash
mkdir src/data/task/shared
```

### **Step 2: Move Shared Files**
```bash
# Move shared utilities
mv src/data/task/get-task-by-id.ts src/data/task/shared/
mv src/data/task/get-project-tasks.ts src/data/task/shared/
mv src/data/task/get-workspace-tasks.ts src/data/task/shared/
mv src/data/task/get-task-page-data.ts src/data/task/shared/
mv src/data/task/revalidate-task-data.ts src/data/task/shared/
```

### **Step 3: Move List View Files**
```bash
# Move list/table view files
mv src/data/task/get-parent-tasks-only.ts src/data/task/list/get-parent-tasks.ts
mv src/data/task/get-subtasks.ts src/data/task/list/get-subtasks.ts
mv src/data/task/get-all-tasks-flat.ts src/data/task/list/get-all-tasks-flat.ts
```

### **Step 4: Create Index Files**
Create barrel exports for each folder

### **Step 5: Update Imports**
Update all import statements across the codebase

---

## 📦 Example Index Files

### `src/data/task/list/index.ts`
```typescript
export { getParentTasksOnly } from './get-parent-tasks';
export { getSubTasks } from './get-subtasks';
export { getAllTasksFlat } from './get-all-tasks-flat';
export type * from './get-parent-tasks';
export type * from './get-subtasks';
export type * from './get-all-tasks-flat';
```

### `src/data/task/gantt/index.ts`
```typescript
export { getGanttTasks } from './get-gantt-tasks';
export type * from './get-gantt-tasks';
```

### `src/data/task/shared/index.ts`
```typescript
export { getTaskById } from './get-task-by-id';
export { getProjectTasks } from './get-project-tasks';
export { getWorkspaceTasks } from './get-workspace-tasks';
export { getTaskPageData } from './get-task-page-data';
export { revalidateTaskData } from './revalidate-task-data';
export type * from './get-task-by-id';
export type * from './get-project-tasks';
export type * from './get-workspace-tasks';
export type * from './get-task-page-data';
```

### `src/data/task/index.ts` (Updated)
```typescript
// Generic task fetcher
export { getTasks } from './get-tasks';
export type * from './get-tasks';

// View-specific exports
export * from './kanban';
export * from './list';
export * from './gantt';
export * from './shared';
```

---

## 🚀 Usage Examples

### **Before** (Current)
```typescript
import { getAllSubTasks } from '@/data/task/kanban/get-all-subtasks';
import { getParentTasksOnly } from '@/data/task/get-parent-tasks-only';
import { getTaskById } from '@/data/task/get-task-by-id';
```

### **After** (Organized)
```typescript
// Kanban view
import { getAllSubTasks } from '@/data/task/kanban';

// List view
import { getParentTasksOnly } from '@/data/task/list';

// Shared
import { getTaskById } from '@/data/task/shared';

// Or import everything from root
import { getAllSubTasks, getParentTasksOnly, getTaskById } from '@/data/task';
```

---

## ✅ Final Structure Summary

```
src/data/task/
├── kanban/          ← Kanban-specific queries
├── list/            ← List/Table-specific queries
├── gantt/           ← Gantt-specific queries
├── shared/          ← Shared utilities
├── get-tasks.ts     ← Generic task fetcher
└── index.ts         ← Main exports
```

**Clean, organized, and scalable!** 🎯
