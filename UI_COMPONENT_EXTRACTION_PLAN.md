# 🎨 UI Component Extraction Plan

## 🎯 Objective

Extract UI components from project-level views into a shared `ui` folder so they can be reused for:
1. **Project-level views** (with project filter)
2. **Workspace-level views** (with optional project filter + other filters)

---

## 📁 Proposed Folder Structure

```
src/
├── app/
│   └── w/[workspaceId]/
│       ├── tasks/                          # NEW: Workspace-level task views
│       │   ├── page.tsx                    # Main workspace tasks page
│       │   ├── _components/
│       │   │   ├── list/
│       │   │   │   └── workspace-task-list-view.tsx
│       │   │   ├── kanban/
│       │   │   │   └── workspace-kanban-view.tsx
│       │   │   └── gantt/
│       │   │       └── workspace-gantt-view.tsx
│       │   └── layout.tsx
│       │
│       └── p/[slug]/                       # EXISTING: Project-level views
│           ├── page.tsx
│           └── _components/
│               ├── list/
│               │   └── project-task-list-view.tsx
│               ├── kanban/
│               │   └── project-kanban-view.tsx
│               └── gantt/
│                   └── project-gantt-view.tsx
│
└── components/
    └── ui/
        └── tasks/                          # NEW: Shared UI components
            ├── list/
            │   ├── task-table.tsx          # Moved from project _components
            │   ├── task-row.tsx
            │   ├── task-table-toolbar.tsx
            │   ├── subtask-list.tsx        # NEW: Subtask list component
            │   ├── subtask-row.tsx         # NEW: Subtask row component
            │   └── task-table-skeleton.tsx
            │
            ├── kanban/
            │   ├── kanban-board.tsx        # Moved from project _components (includes column logic)
            │   ├── kanban-card.tsx
            │   ├── kanban-toolbar.tsx      # Toolbar with filters
            │   └── kanban-board-skeleton.tsx
            │
            ├── gantt/
            │   ├── gantt-chart.tsx         # Already moved
            │   ├── draggable-subtask-bar.tsx
            │   ├── subtask-bar.tsx
            │   ├── task-row.tsx
            │   ├── timeline-grid.tsx
            │   ├── dependency-lines.tsx
            │   ├── dependency-picker.tsx
            │   ├── sortable-subtask-list.tsx
            │   ├── types.ts
            │   ├── utils.ts
            │   └── gantt-chart-skeleton.tsx
            │
            └── shared/
                ├── task-filters.tsx        # NEW: Unified filter component
                ├── task-search.tsx
                ├── view-switcher.tsx
                └── task-details-sheet.tsx
```

---

## 🔄 Component Migration Plan

### **Phase 1: List View Components**

#### **Components to Move**

| Current Location | New Location | Purpose |
|------------------|--------------|---------|
| `p/[slug]/_components/list/task-table.tsx` | `components/ui/tasks/list/task-table.tsx` | Main table component |
| `p/[slug]/_components/list/task-row.tsx` | `components/ui/tasks/list/task-row.tsx` | Individual task row |
| `p/[slug]/_components/list/subtask-list.tsx` | `components/ui/tasks/list/subtask-list.tsx` | **Subtask list component** |
| `p/[slug]/_components/list/subtask-row.tsx` | `components/ui/tasks/list/subtask-row.tsx` | **Subtask row component** |
| `p/[slug]/_components/list/task-table-toolbar.tsx` | `components/ui/tasks/list/task-table-toolbar.tsx` | Toolbar with actions |
| `p/[slug]/_components/list/types.ts` | `components/ui/tasks/list/types.ts` | Shared types |

#### **New Props Structure**

```typescript
// components/ui/tasks/list/task-table.tsx
interface TaskTableProps {
  // Data
  initialTasks: WorkspaceTaskType[];
  initialHasMore: boolean;
  initialTotalCount: number;
  
  // Context
  workspaceId: string;
  projectId?: string;              // Optional for workspace view
  
  // UI
  members: ProjectMembersType;
  canCreateSubTask: boolean;
  
  // Filters (NEW!)
  filters?: {
    status?: TaskStatus;
    assigneeId?: string;
    startDate?: Date;
    endDate?: Date;
    tag?: TaskTag;
  };
  
  // Callbacks
  onFilterChange?: (filters: TaskFilters) => void;
}
```

---

### **Phase 2: Kanban View Components**

#### **Components to Move**

| Current Location | New Location | Purpose |
|------------------|--------------|---------|
| `p/[slug]/_components/kanban/kanban-board-paginated.tsx` | `components/ui/tasks/kanban/kanban-board.tsx` | Main Kanban board (includes column logic) |
| `p/[slug]/_components/kanban/kanban-card.tsx` | `components/ui/tasks/kanban/kanban-card.tsx` | Task card |
| `p/[slug]/_components/kanban/kanban-toolbar.tsx` | `components/ui/tasks/kanban/kanban-toolbar.tsx` | Toolbar with filters |

#### **Container Files (Stay in Project)**

These files are **project-specific wrappers** and should **NOT** be moved to shared UI:

| File | Purpose | Location |
|------|---------|----------|
| `kanban-container-paginated.tsx` | Server component - fetches data for project | **Keep in project** |

> **Why keep container in project?**
> - It fetches project-specific data
> - Workspace view will have its own container
> - Only the **UI components** (board, card, toolbar) are shared

> **Note**: `kanban-container-client.tsx` is **NOT used** and can be **deleted** ❌

#### **New Props Structure**

```typescript
// components/ui/tasks/kanban/kanban-board.tsx
interface KanbanBoardProps {
  // Data
  initialData: {
    TO_DO: SubTasksByStatusResponse;
    IN_PROGRESS: SubTasksByStatusResponse;
    BLOCKED: SubTasksByStatusResponse;
    REVIEW: SubTasksByStatusResponse;
    HOLD: SubTasksByStatusResponse;
    COMPLETED: SubTasksByStatusResponse;
  };
  
  // Context
  workspaceId: string;
  projectId?: string;              // Optional for workspace view
  
  // UI
  projectMembers: ProjectMembersType;
  
  // Filters (NEW!)
  filters?: {
    assigneeId?: string;
    tag?: TaskTag;
  };
  
  // Callbacks
  onFilterChange?: (filters: KanbanFilters) => void;
}
```

---

### **Phase 3: Gantt View Components**

#### **Components to Move**

| Current Location | New Location | Purpose |
|------------------|--------------|---------|
| `p/[slug]/_components/gantt/draggable-subtask-bar.tsx` | `components/ui/tasks/gantt/draggable-subtask-bar.tsx` | Draggable subtask bar |
| `p/[slug]/_components/gantt/subtask-bar.tsx` | `components/ui/tasks/gantt/subtask-bar.tsx` | Subtask bar display |
| `p/[slug]/_components/gantt/task-row.tsx` | `components/ui/tasks/gantt/task-row.tsx` | Task row |
| `p/[slug]/_components/gantt/timeline-grid.tsx` | `components/ui/tasks/gantt/timeline-grid.tsx` | Timeline grid |
| `p/[slug]/_components/gantt/dependency-lines.tsx` | `components/ui/tasks/gantt/dependency-lines.tsx` | Dependency lines |
| `p/[slug]/_components/gantt/dependency-picker.tsx` | `components/ui/tasks/gantt/dependency-picker.tsx` | Dependency picker |
| `p/[slug]/_components/gantt/sortable-subtask-list.tsx` | `components/ui/tasks/gantt/sortable-subtask-list.tsx` | Sortable subtask list |
| `p/[slug]/_components/gantt/types.ts` | `components/ui/tasks/gantt/types.ts` | Gantt types |
| `p/[slug]/_components/gantt/utils.ts` | `components/ui/tasks/gantt/utils.ts` | Utility functions |

**Note**: `gantt-chart.tsx` is already in `components/task/gantt/` ✅

#### **Container Files (Stay in Project)**

These files are **project-specific wrappers** and should **NOT** be moved to shared UI:

| File | Purpose | Location |
|------|---------|----------|
| `gantt-server-wrapper.tsx` | Server component - fetches data for project | **Keep in project** |
| `gantt-container.tsx` | Client wrapper - handles pagination | **Keep in project** |

> **Why keep containers in project?**
> - They fetch project-specific data
> - They handle project-specific pagination
> - Workspace view will have its own containers
> - Only the **UI components** are shared

> **See `GANTT_COMPONENT_INVENTORY.md` for complete details**

---

## 🎛️ Unified Filter Component

### **New Component: `task-filters.tsx`**

```typescript
// components/ui/tasks/shared/task-filters.tsx

interface TaskFiltersProps {
  // Current filters
  filters: {
    projectId?: string;
    status?: TaskStatus;
    assigneeId?: string;
    startDate?: Date;
    endDate?: Date;
    tag?: TaskTag;
  };
  
  // Available options
  projects?: { id: string; name: string }[];
  members?: { id: string; name: string }[];
  
  // Callbacks
  onFilterChange: (filters: TaskFilters) => void;
  onClearFilters: () => void;
  
  // UI
  view: 'list' | 'kanban' | 'gantt';
  showProjectFilter?: boolean;     // Show for workspace view
}

export function TaskFilters({ ... }: TaskFiltersProps) {
  return (
    <div className="flex gap-2">
      {/* Project Filter (workspace view only) */}
      {showProjectFilter && (
        <Select value={filters.projectId} onChange={...}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id}>{p.name}</option>)}
        </Select>
      )}
      
      {/* Status Filter */}
      <Select value={filters.status} onChange={...}>
        <option value="">All Statuses</option>
        <option value="TO_DO">To Do</option>
        <option value="IN_PROGRESS">In Progress</option>
        {/* ... */}
      </Select>
      
      {/* Assignee Filter */}
      <Select value={filters.assigneeId} onChange={...}>
        <option value="">All Assignees</option>
        {members.map(m => <option key={m.id}>{m.name}</option>)}
      </Select>
      
      {/* Date Range Filter */}
      <DateRangePicker 
        startDate={filters.startDate}
        endDate={filters.endDate}
        onChange={...}
      />
      
      {/* Tag Filter */}
      <Select value={filters.tag} onChange={...}>
        <option value="">All Tags</option>
        <option value="URGENT">Urgent</option>
        {/* ... */}
      </Select>
      
      {/* Clear Filters */}
      <Button onClick={onClearFilters}>Clear</Button>
    </div>
  );
}
```

---

## 🔄 Usage Examples

### **Project-Level List View**

```typescript
// src/app/w/[workspaceId]/p/[slug]/_components/list/project-task-list-view.tsx

import { TaskTable } from '@/components/ui/tasks/list/task-table';

export async function ProjectTaskListView({ workspaceId, projectId, projectMembers }) {
  const { tasks, hasMore, totalCount } = await getWorkspaceTasks(
    workspaceId,
    { projectId },  // Filter by project
    1,
    10
  );

  return (
    <TaskTable
      initialTasks={tasks}
      initialHasMore={hasMore}
      initialTotalCount={totalCount}
      workspaceId={workspaceId}
      projectId={projectId}           // ← Project context
      members={projectMembers}
      canCreateSubTask={true}
      // No filters prop - project view doesn't need extra filters
    />
  );
}
```

---

### **Workspace-Level List View**

```typescript
// src/app/w/[workspaceId]/tasks/_components/list/workspace-task-list-view.tsx

import { TaskTable } from '@/components/ui/tasks/list/task-table';
import { TaskFilters } from '@/components/ui/tasks/shared/task-filters';

export async function WorkspaceTaskListView({ workspaceId, initialFilters }) {
  const { tasks, hasMore, totalCount } = await getWorkspaceTasks(
    workspaceId,
    initialFilters,  // Can include projectId, status, etc.
    1,
    10
  );

  return (
    <div>
      {/* Filters */}
      <TaskFilters
        filters={initialFilters}
        projects={userProjects}
        members={workspaceMembers}
        view="list"
        showProjectFilter={true}      // ← Show project filter
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />
      
      {/* Table */}
      <TaskTable
        initialTasks={tasks}
        initialHasMore={hasMore}
        initialTotalCount={totalCount}
        workspaceId={workspaceId}
        projectId={undefined}          // ← No project context
        members={workspaceMembers}
        canCreateSubTask={true}
        filters={initialFilters}       // ← Pass filters
        onFilterChange={handleFilterChange}
      />
    </div>
  );
}
```

---

### **Project-Level Kanban View**

```typescript
// src/app/w/[workspaceId]/p/[slug]/_components/kanban/project-kanban-view.tsx

import { KanbanBoard } from '@/components/ui/tasks/kanban/kanban-board';

export async function ProjectKanbanView({ workspaceId, projectId }) {
  const initialData = await fetchAllColumns(workspaceId, projectId);

  return (
    <KanbanBoard
      initialData={initialData}
      workspaceId={workspaceId}
      projectId={projectId}           // ← Project context
      projectMembers={projectMembers}
      // No filters prop
    />
  );
}
```

---

### **Workspace-Level Kanban View**

```typescript
// src/app/w/[workspaceId]/tasks/_components/kanban/workspace-kanban-view.tsx

import { KanbanBoard } from '@/components/ui/tasks/kanban/kanban-board';
import { TaskFilters } from '@/components/ui/tasks/shared/task-filters';

export async function WorkspaceKanbanView({ workspaceId, initialFilters }) {
  const initialData = await fetchAllColumns(workspaceId, undefined, initialFilters);

  return (
    <div>
      {/* Filters */}
      <TaskFilters
        filters={initialFilters}
        projects={userProjects}
        members={workspaceMembers}
        view="kanban"
        showProjectFilter={true}      // ← Show project filter
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />
      
      {/* Board */}
      <KanbanBoard
        initialData={initialData}
        workspaceId={workspaceId}
        projectId={undefined}          // ← No project context
        projectMembers={workspaceMembers}
        filters={initialFilters}       // ← Pass filters
        onFilterChange={handleFilterChange}
      />
    </div>
  );
}
```

---

## 📋 Migration Checklist

### **Step 1: Create Folder Structure**
- [ ] Create `src/components/ui/tasks/` folder
- [ ] Create subfolders: `list/`, `kanban/`, `gantt/`, `shared/`

### **Step 2: Move List View Components**
- [ ] Move `task-table.tsx` to `components/ui/tasks/list/`
- [ ] Move `task-row.tsx` to `components/ui/tasks/list/`
- [ ] Move `subtask-list.tsx` to `components/ui/tasks/list/` ← **Subtask component**
- [ ] Move `subtask-row.tsx` to `components/ui/tasks/list/` ← **Subtask component**
- [ ] Move `task-table-toolbar.tsx` to `components/ui/tasks/list/`
- [ ] Move `types.ts` to `components/ui/tasks/list/`
- [ ] Update all imports

### **Step 3: Move Kanban View Components**
- [ ] Move `kanban-board-paginated.tsx` to `components/ui/tasks/kanban/kanban-board.tsx`
- [ ] Move `kanban-card.tsx` to `components/ui/tasks/kanban/`
- [ ] Move `kanban-toolbar.tsx` to `components/ui/tasks/kanban/`
- [ ] Keep `kanban-container-paginated.tsx` in project (data fetching)
- [ ] **Delete** `kanban-container-client.tsx` (not used) ❌
- [ ] Update all imports

### **Step 4: Move Gantt View Components**
- [ ] Move `draggable-subtask-bar.tsx` to `components/ui/tasks/gantt/`
- [ ] Move `subtask-bar.tsx` to `components/ui/tasks/gantt/`
- [ ] Move `task-row.tsx` to `components/ui/tasks/gantt/`
- [ ] Move `timeline-grid.tsx` to `components/ui/tasks/gantt/`
- [ ] Move `dependency-lines.tsx` to `components/ui/tasks/gantt/`
- [ ] Move `dependency-picker.tsx` to `components/ui/tasks/gantt/`
- [ ] Move `sortable-subtask-list.tsx` to `components/ui/tasks/gantt/`
- [ ] Move `types.ts` to `components/ui/tasks/gantt/`
- [ ] Move `utils.ts` to `components/ui/tasks/gantt/`
- [ ] Keep `gantt-server-wrapper.tsx` in project (data fetching)
- [ ] Keep `gantt-container.tsx` in project (pagination)
- [ ] Update all imports

### **Step 5: Create Shared Components**
- [ ] Create `task-filters.tsx` in `components/ui/tasks/shared/`
- [ ] Create `task-search.tsx` in `components/ui/tasks/shared/`
- [ ] Create `view-switcher.tsx` in `components/ui/tasks/shared/`

### **Step 6: Update Project-Level Views**
- [ ] Update `p/[slug]/_components/list/` to use shared components
- [ ] Update `p/[slug]/_components/kanban/` to use shared components
- [ ] Update `p/[slug]/_components/gantt/` to use shared components

### **Step 7: Create Workspace-Level Views**
- [ ] Create `w/[workspaceId]/tasks/page.tsx`
- [ ] Create workspace list view component
- [ ] Create workspace kanban view component
- [ ] Create workspace gantt view component

### **Step 8: Add Filter Support**
- [ ] Add filter state management
- [ ] Add filter persistence (URL params)
- [ ] Add filter UI components
- [ ] Test filtering functionality

---

## 🎯 Key Differences: Project vs Workspace Views

| Feature | Project View | Workspace View |
|---------|--------------|----------------|
| **Project Filter** | ❌ Not shown (implicit) | ✅ Shown (dropdown) |
| **Data Source** | `getWorkspaceTasks(wsId, { projectId })` | `getWorkspaceTasks(wsId, filters)` |
| **Filters** | Status, Assignee, Date, Tag | **Project**, Status, Assignee, Date, Tag |
| **Context** | Single project | Multiple projects |
| **Members** | Project members | Workspace members |

---

## 📦 Component Props Comparison

### **TaskTable Component**

```typescript
// Project View
<TaskTable
  workspaceId={workspaceId}
  projectId={projectId}        // ← Fixed project
  members={projectMembers}
  // No filters prop
/>

// Workspace View
<TaskTable
  workspaceId={workspaceId}
  projectId={undefined}        // ← No fixed project
  members={workspaceMembers}
  filters={filters}            // ← With filters
  onFilterChange={onChange}
/>
```

---

## 🚀 Benefits

### **1. Code Reusability** ♻️
- ✅ Same UI components for project and workspace views
- ✅ No duplicate code
- ✅ Easier maintenance

### **2. Consistency** 🎨
- ✅ Same look and feel across all views
- ✅ Same interactions and behaviors
- ✅ Better UX

### **3. Flexibility** 🎛️
- ✅ Easy to add new filters
- ✅ Easy to add new views
- ✅ Easy to customize per context

### **4. Maintainability** 🔧
- ✅ Single source of truth for UI
- ✅ Fix bugs once, applies everywhere
- ✅ Clear separation of concerns

---

## 📝 Next Steps

1. **Review this plan** - Confirm the folder structure and approach
2. **Start with List View** - Move list components first (smallest scope)
3. **Test thoroughly** - Ensure project views still work
4. **Move Kanban View** - Apply same pattern
5. **Create Workspace Views** - Build new workspace-level pages
6. **Add Filters** - Implement unified filter component
7. **Test & Polish** - Ensure everything works smoothly

---

## ✅ Success Criteria

- [ ] All UI components are in `components/ui/tasks/`
- [ ] Project views use shared components
- [ ] Workspace views use shared components
- [ ] Filters work correctly in workspace views
- [ ] No duplicate UI code
- [ ] All tests pass
- [ ] Documentation is updated

---

**Ready to start the migration?** Let me know which phase you'd like to tackle first! 🚀
