# 📂 Reorganize Data Layer by View Type

## 🎯 Current Structure (By Function)

```
src/data/task/
├── get-all-subtasks.ts
├── get-all-tasks-flat.ts
├── get-parent-tasks-only.ts
├── get-project-tasks.ts
├── get-subtasks.ts
├── get-task-by-id.ts
├── get-task-page-data.ts
├── get-tasks.ts
├── index.ts
└── revalidate-task-data.ts
```

**Problem**: Hard to know which file is used by which view!

---

## ✅ Proposed Structure (By View Type)

```
src/data/task/
├── list/                           ← List View Data
│   ├── get-parent-tasks.ts        (get-parent-tasks-only.ts)
│   ├── get-subtasks.ts            (get-subtasks.ts)
│   └── index.ts
│
├── kanban/                         ← Kanban View Data
│   ├── get-kanban-tasks.ts        (get-project-tasks.ts)
│   └── index.ts
│
├── gantt/                          ← Gantt View Data
│   ├── get-gantt-tasks.ts         (get-all-tasks-flat.ts)
│   ├── get-all-subtasks.ts        (get-all-subtasks.ts)
│   └── index.ts
│
├── shared/                         ← Shared Across Views
│   ├── get-task-by-id.ts          (get-task-by-id.ts)
│   ├── get-task-page-data.ts      (get-task-page-data.ts)
│   ├── revalidate-task-data.ts    (revalidate-task-data.ts)
│   └── index.ts
│
└── index.ts                        ← Main barrel export
```

---

## 📋 File Mapping

### **List View** (`src/data/task/list/`)

| Old File | New File | Purpose |
|----------|----------|---------|
| `get-parent-tasks-only.ts` | `get-parent-tasks.ts` | Load parent tasks with pagination |
| `get-subtasks.ts` | `get-subtasks.ts` | Load subtasks when expanding |

**Usage**:
```tsx
import { getParentTasks, getSubTasks } from "@/data/task/list";
```

---

### **Kanban View** (`src/data/task/kanban/`)

| Old File | New File | Purpose |
|----------|----------|---------|
| `get-project-tasks.ts` | `get-kanban-tasks.ts` | Load all tasks grouped by status |

**Usage**:
```tsx
import { getKanbanTasks } from "@/data/task/kanban";
```

---

### **Gantt View** (`src/data/task/gantt/`)

| Old File | New File | Purpose |
|----------|----------|---------|
| `get-all-tasks-flat.ts` | `get-gantt-tasks.ts` | Load all tasks as flat list with dates |
| `get-all-subtasks.ts` | `get-all-subtasks.ts` | Load all subtasks for dependencies |

**Usage**:
```tsx
import { getGanttTasks, getAllSubTasks } from "@/data/task/gantt";
```

---

### **Shared** (`src/data/task/shared/`)

| Old File | New File | Purpose |
|----------|----------|---------|
| `get-task-by-id.ts` | `get-task-by-id.ts` | Get single task details |
| `get-task-page-data.ts` | `get-task-page-data.ts` | Get page metadata |
| `revalidate-task-data.ts` | `revalidate-task-data.ts` | Cache revalidation |

**Usage**:
```tsx
import { getTaskById, getTaskPageData } from "@/data/task/shared";
```

---

## 🔄 Migration Steps

### **Step 1: Create New Folder Structure**

```bash
mkdir -p src/data/task/list
mkdir -p src/data/task/kanban
mkdir -p src/data/task/gantt
mkdir -p src/data/task/shared
```

---

### **Step 2: Move Files**

#### **List View**
```bash
# Move and rename
mv src/data/task/get-parent-tasks-only.ts src/data/task/list/get-parent-tasks.ts
mv src/data/task/get-subtasks.ts src/data/task/list/get-subtasks.ts
```

#### **Kanban View**
```bash
# Move and rename
mv src/data/task/get-project-tasks.ts src/data/task/kanban/get-kanban-tasks.ts
```

#### **Gantt View**
```bash
# Move and rename
mv src/data/task/get-all-tasks-flat.ts src/data/task/gantt/get-gantt-tasks.ts
mv src/data/task/get-all-subtasks.ts src/data/task/gantt/get-all-subtasks.ts
```

#### **Shared**
```bash
# Move (keep names)
mv src/data/task/get-task-by-id.ts src/data/task/shared/
mv src/data/task/get-task-page-data.ts src/data/task/shared/
mv src/data/task/revalidate-task-data.ts src/data/task/shared/
```

---

### **Step 3: Create Barrel Exports**

#### **`src/data/task/list/index.ts`**
```typescript
export { getParentTasksOnly as getParentTasks } from "./get-parent-tasks";
export { getSubTasks } from "./get-subtasks";
export type { ParentTasksOnlyResponse, ParentTaskType } from "./get-parent-tasks";
export type { SubTasksResponse, SubTaskType } from "./get-subtasks";
```

#### **`src/data/task/kanban/index.ts`**
```typescript
export { getProjectTasks as getKanbanTasks } from "./get-kanban-tasks";
export type { ProjectTaskType, SubTaskType } from "./get-kanban-tasks";
```

#### **`src/data/task/gantt/index.ts`**
```typescript
export { getAllTasksFlat as getGanttTasks } from "./get-gantt-tasks";
export { getAllSubTasks } from "./get-all-subtasks";
export type { AllTasksFlatResponse, FlatTaskType } from "./get-gantt-tasks";
export type { AllSubTasksResponse, SubTaskType } from "./get-all-subtasks";
```

#### **`src/data/task/shared/index.ts`**
```typescript
export { getTaskById } from "./get-task-by-id";
export { getTaskPageData } from "./get-task-page-data";
export { revalidateTaskData } from "./revalidate-task-data";
export type { TaskByIdType } from "./get-task-by-id";
export type { TaskPageDataType } from "./get-task-page-data";
```

#### **`src/data/task/index.ts`** (Main)
```typescript
// List view
export * from "./list";

// Kanban view
export * from "./kanban";

// Gantt view
export * from "./gantt";

// Shared
export * from "./shared";
```

---

### **Step 4: Update Imports**

#### **List View Components**
```typescript
// Before
import { getParentTasksOnly, getSubTasks } from "@/data/task";

// After
import { getParentTasks, getSubTasks } from "@/data/task/list";
```

#### **Kanban View Components**
```typescript
// Before
import { getProjectTasks } from "@/data/task/get-project-tasks";

// After
import { getKanbanTasks } from "@/data/task/kanban";
```

#### **Gantt View Components**
```typescript
// Before
import { getAllTasksFlat } from "@/data/task";

// After
import { getGanttTasks } from "@/data/task/gantt";
```

---

## 📊 Benefits

### **Before** (Current)
```typescript
// Hard to know which file to use!
import { getParentTasksOnly } from "@/data/task";
import { getAllTasksFlat } from "@/data/task";
import { getProjectTasks } from "@/data/task";
```

### **After** (Organized by View)
```typescript
// Clear which data is for which view!
import { getParentTasks } from "@/data/task/list";
import { getGanttTasks } from "@/data/task/gantt";
import { getKanbanTasks } from "@/data/task/kanban";
```

**Improvements**:
- ✅ Clear organization by view type
- ✅ Easy to find the right file
- ✅ Better code discoverability
- ✅ Logical grouping

---

## ✅ Final Structure

```
src/data/task/
│
├── list/                   ← List View
│   ├── get-parent-tasks.ts
│   ├── get-subtasks.ts
│   └── index.ts
│
├── kanban/                 ← Kanban View
│   ├── get-kanban-tasks.ts
│   └── index.ts
│
├── gantt/                  ← Gantt View
│   ├── get-gantt-tasks.ts
│   ├── get-all-subtasks.ts
│   └── index.ts
│
├── shared/                 ← Shared
│   ├── get-task-by-id.ts
│   ├── get-task-page-data.ts
│   ├── revalidate-task-data.ts
│   └── index.ts
│
└── index.ts                ← Main export
```

---

## 🎯 Summary

**Current**: Files organized by function (hard to know which view uses what)

**Proposed**: Files organized by view type (clear separation)

**Benefits**:
- ✅ Clear which data belongs to which view
- ✅ Easier to maintain
- ✅ Better developer experience
- ✅ Logical organization

**Ready to implement?** 🚀
