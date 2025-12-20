# Task Data Refactoring Plan - Workspace-First Architecture

## 🎯 Goal
Refactor all task data queries to be **workspace-level by default**, with **project filtering** applied when user enters a specific project.

---

## 📊 Current State Analysis

### Current Files
```
src/data/task/
├── list/
│   ├── get-tasks.ts              ❌ Project-specific
│   ├── get-parent-tasks-only.ts  ❌ Project-specific
│   └── get-subtasks.ts           ❌ Project-specific
├── kanban/
│   ├── get-all-subtasks.ts       ❌ Project-specific
│   └── get-subtasks-by-status.ts ❌ Project-specific
├── gantt/
│   └── get-all-tasks-flat.ts     ❌ Project-specific
├── get-workspace-tasks.ts        ✅ Workspace-level (KEEP!)
├── get-task-by-id.ts             ✅ Single task (KEEP!)
├── get-task-page-data.ts         ❌ Needs refactor
└── revalidate-task-data.ts       ✅ Cache management (KEEP!)
```

---

## 🔄 Refactoring Strategy

### **Core Principle**
**One source of truth**: `get-workspace-tasks.ts` with view-specific filters

### **Architecture**
```
┌─────────────────────────────────────┐
│   get-workspace-tasks.ts            │
│   (Single source of truth)          │
│   - Workspace-level data            │
│   - Role-based filtering            │
│   - Project filter (optional)       │
│   - Status, assignee, date filters  │
└─────────────────────────────────────┘
              ↓
    ┌─────────┴─────────┐
    ↓         ↓         ↓
┌────────┐ ┌────────┐ ┌────────┐
│  List  │ │ Kanban │ │ Gantt  │
│  View  │ │  View  │ │  View  │
└────────┘ └────────┘ └────────┘
```

---

## 📝 Detailed Refactoring Plan

### **Phase 1: Enhance Workspace Tasks** ✅ (Already done!)

**File**: `get-workspace-tasks.ts`

**Current Features**:
- ✅ Workspace-level queries
- ✅ Role-based access (ADMIN/OWNER see all, MEMBER see assigned)
- ✅ Project filtering
- ✅ Status filtering
- ✅ Assignee filtering
- ✅ Date range filtering
- ✅ Tag filtering
- ✅ Pagination

**Status**: **PERFECT! This is our foundation.**

---

### **Phase 2: Refactor List View**

#### **Current Files** (Delete/Consolidate)
1. `list/get-tasks.ts` ❌
2. `list/get-parent-tasks-only.ts` ❌
3. `list/get-subtasks.ts` ❌

#### **New Approach**
Use `get-workspace-tasks.ts` with appropriate filters:

```typescript
// List view - All tasks in workspace
const { tasks } = await getWorkspaceTasks(workspaceId, {}, page, pageSize);

// List view - Tasks in specific project
const { tasks } = await getWorkspaceTasks(workspaceId, { 
  projectId: projectId 
}, page, pageSize);

// List view - Filter by status
const { tasks } = await getWorkspaceTasks(workspaceId, { 
  projectId: projectId,
  status: 'IN_PROGRESS'
}, page, pageSize);
```

---

### **Phase 3: Refactor Kanban View**

#### **Current Files** (Refactor)
1. `kanban/get-all-subtasks.ts` - Needs workspace-level version
2. `kanban/get-subtasks-by-status.ts` - Needs workspace-level version

#### **New Approach**
Create `kanban/get-workspace-subtasks.ts`:

```typescript
export async function getWorkspaceSubtasks(
  workspaceId: string,
  filters: {
    projectId?: string;    // Optional project filter
    status?: TaskStatus;   // Optional status filter
    parentTaskId?: string; // Optional parent filter
  }
) {
  // Fetch subtasks across workspace
  // Filter by project if provided
  // Group by status for Kanban columns
}
```

**Usage**:
```typescript
// Kanban - All subtasks in workspace
const subtasks = await getWorkspaceSubtasks(workspaceId, {});

// Kanban - Subtasks in specific project
const subtasks = await getWorkspaceSubtasks(workspaceId, { 
  projectId: projectId 
});

// Kanban - Specific status column in project
const subtasks = await getWorkspaceSubtasks(workspaceId, { 
  projectId: projectId,
  status: 'IN_PROGRESS'
});
```

---

### **Phase 4: Refactor Gantt View**

#### **Current Files** (Refactor)
1. `gantt/get-all-tasks-flat.ts` - Needs workspace-level version

#### **New Approach**
Create `gantt/get-workspace-tasks-flat.ts`:

```typescript
export async function getWorkspaceTasksFlat(
  workspaceId: string,
  filters: {
    projectId?: string;    // Optional project filter
    startDate?: Date;      // Date range for Gantt
    endDate?: Date;
  }
) {
  // Fetch all tasks (parent + subtasks) in flat structure
  // Filter by project if provided
  // Optimized for Gantt timeline view
}
```

---

## 🗂️ Proposed New Structure

```
src/data/task/
├── get-workspace-tasks.ts        ✅ Core workspace query
│
├── list/
│   └── index.ts                  ✨ Re-exports workspace functions
│
├── kanban/
│   ├── get-workspace-subtasks.ts ✨ New workspace-level subtasks
│   └── index.ts                  ✨ Barrel exports
│
├── gantt/
│   ├── get-workspace-tasks-flat.ts ✨ New workspace-level flat tasks
│   └── index.ts                  ✨ Barrel exports
│
├── get-task-by-id.ts             ✅ Keep (single task)
├── get-task-page-data.ts         🔄 Refactor to use workspace query
├── revalidate-task-data.ts       ✅ Keep (cache management)
└── index.ts                      🔄 Update exports
```

---

## 📋 Migration Checklist

### **Step 1: List View** ✅
- [ ] Delete `list/get-tasks.ts`
- [ ] Delete `list/get-parent-tasks-only.ts`
- [ ] Delete `list/get-subtasks.ts`
- [ ] Create `list/index.ts` that re-exports `getWorkspaceTasks`
- [ ] Update imports in components

### **Step 2: Kanban View** 🔄
- [ ] Create `kanban/get-workspace-subtasks.ts`
- [ ] Migrate logic from `get-all-subtasks.ts`
- [ ] Add project filtering
- [ ] Update `kanban/index.ts`
- [ ] Delete old files
- [ ] Update imports in components

### **Step 3: Gantt View** 🔄
- [ ] Create `gantt/get-workspace-tasks-flat.ts`
- [ ] Migrate logic from `get-all-tasks-flat.ts`
- [ ] Add project filtering
- [ ] Update `gantt/index.ts`
- [ ] Delete old files
- [ ] Update imports in components

### **Step 4: Update Components** 🔄
- [ ] Update all component imports
- [ ] Add project filter where needed
- [ ] Test all views (workspace + project)

---

## 🎯 Benefits

### **1. Single Source of Truth**
- ✅ All task data comes from workspace-level queries
- ✅ Consistent permission handling
- ✅ Easier to maintain

### **2. Flexible Filtering**
- ✅ Same query works for workspace and project views
- ✅ Just add `projectId` filter when in project context
- ✅ Combine multiple filters easily

### **3. Better Performance**
- ✅ Shared caching across views
- ✅ Optimized queries
- ✅ Less duplicate code

### **4. Scalability**
- ✅ Easy to add new views
- ✅ Easy to add new filters
- ✅ Consistent patterns

---

## 🚀 Implementation Order

1. **Phase 1**: ✅ Already done! (`get-workspace-tasks.ts`)
2. **Phase 2**: Refactor List View (simplest)
3. **Phase 3**: Refactor Kanban View (medium complexity)
4. **Phase 4**: Refactor Gantt View (most complex)
5. **Phase 5**: Update all component imports
6. **Phase 6**: Delete old files
7. **Phase 7**: Test everything

---

## 📝 Example Usage After Refactoring

### **Workspace View** (No project filter)
```typescript
// List view - workspace level
const { tasks } = await getWorkspaceTasks(workspaceId);

// Kanban view - workspace level
const subtasks = await getWorkspaceSubtasks(workspaceId);

// Gantt view - workspace level
const flatTasks = await getWorkspaceTasksFlat(workspaceId);
```

### **Project View** (With project filter)
```typescript
// List view - project level
const { tasks } = await getWorkspaceTasks(workspaceId, { 
  projectId: projectId 
});

// Kanban view - project level
const subtasks = await getWorkspaceSubtasks(workspaceId, { 
  projectId: projectId 
});

// Gantt view - project level
const flatTasks = await getWorkspaceTasksFlat(workspaceId, { 
  projectId: projectId 
});
```

---

**Ready to implement? Let me know which phase to start with!** 🚀
