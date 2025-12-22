# 📊 Complete Gantt Component Inventory

## 🎯 Current Structure

### **Already in Shared UI** ✅
```
src/components/task/gantt/
└── gantt-chart.tsx              # Main Gantt chart component
```

### **In Project Folder** 📁
```
src/app/w/[workspaceId]/p/[slug]/_components/gantt/
├── gantt-container.tsx          # Client container (pagination)
├── gantt-server-wrapper.tsx     # Server wrapper (data fetching)
├── draggable-subtask-bar.tsx    # UI: Draggable subtask bar
├── subtask-bar.tsx              # UI: Subtask bar
├── task-row.tsx                 # UI: Task row
├── timeline-grid.tsx            # UI: Timeline grid
├── dependency-lines.tsx         # UI: Dependency lines
├── dependency-picker.tsx        # UI: Dependency picker
├── sortable-subtask-list.tsx    # UI: Sortable subtask list
├── types.ts                     # Shared types
└── utils.ts                     # Utility functions
```

---

## 🔍 File Analysis

### **Container Files** (Keep in Project)

#### **1. gantt-server-wrapper.tsx** 🔒
**Purpose**: Server component - fetches project data

```typescript
export async function GanttServerWrapper({ workspaceId, projectId }) {
    // Get all tasks in a flat structure
    const { tasks: allTasks } = await getAllTasksFlat(projectId, workspaceId);
    
    // Transform to Gantt format
    const ganttTasks = transformToGanttFormat(allTasks);
    
    return (
        <GanttContainer
            workspaceId={workspaceId}
            projectId={projectId}
            initialTasks={ganttTasks}
            subtaskDataMap={subtaskDataMap}
        />
    );
}
```

**Status**: ✅ **Keep in project** - Project-specific data fetching

---

#### **2. gantt-container.tsx** 🔒
**Purpose**: Client container - handles pagination and state

```typescript
export function GanttContainer({ workspaceId, projectId, initialTasks, subtaskDataMap }) {
    const [visibleTaskCount, setVisibleTaskCount] = useState(TASKS_PER_PAGE);
    const { openSubTaskSheet } = useSubTaskSheet();
    
    const handleSubtaskClick = (subtaskId: string) => {
        const subtaskData = subtaskDataMap.get(subtaskId);
        if (subtaskData) {
            openSubTaskSheet(subtaskData);
        }
    };
    
    return (
        <GanttChart
            tasks={visibleTasks}
            workspaceId={workspaceId}
            projectId={projectId}
            onSubtaskClick={handleSubtaskClick}
        />
    );
}
```

**Status**: ✅ **Keep in project** - Project-specific pagination logic

---

### **UI Components** (Move to Shared)

#### **3. draggable-subtask-bar.tsx** 📦
**Purpose**: Draggable subtask bar with drag & drop

**Status**: ⏳ **Move to** `components/task/gantt/`

---

#### **4. subtask-bar.tsx** 📦
**Purpose**: Individual subtask bar display

**Status**: ⏳ **Move to** `components/task/gantt/`

---

#### **5. task-row.tsx** 📦
**Purpose**: Task row in Gantt chart

**Status**: ⏳ **Move to** `components/task/gantt/`

---

#### **6. timeline-grid.tsx** 📦
**Purpose**: Timeline grid background

**Status**: ⏳ **Move to** `components/task/gantt/`

---

#### **7. dependency-lines.tsx** 📦
**Purpose**: Draws dependency lines between tasks

**Status**: ⏳ **Move to** `components/task/gantt/`

---

#### **8. dependency-picker.tsx** 📦
**Purpose**: UI for picking task dependencies

**Status**: ⏳ **Move to** `components/task/gantt/`

---

#### **9. sortable-subtask-list.tsx** 📦
**Purpose**: Sortable list of subtasks

**Status**: ⏳ **Move to** `components/task/gantt/`

---

### **Shared Files** (Move to Shared)

#### **10. types.ts** 📦
**Purpose**: Gantt-specific types (`GanttTask`, `GanttSubtask`)

**Status**: ⏳ **Move to** `components/task/gantt/types.ts`

---

#### **11. utils.ts** 📦
**Purpose**: Utility functions (date formatting, dependency validation)

**Status**: ⏳ **Move to** `components/task/gantt/utils.ts`

---

## 📋 Migration Summary

### **Total Gantt Files**: 11

### **Already Moved**: 1
- ✅ `gantt-chart.tsx` (in `components/task/gantt/`)

### **Keep in Project**: 2
- 🔒 `gantt-server-wrapper.tsx` (data fetching)
- 🔒 `gantt-container.tsx` (pagination)

### **Move to Shared**: 9
- 📦 `draggable-subtask-bar.tsx`
- 📦 `subtask-bar.tsx`
- 📦 `task-row.tsx`
- 📦 `timeline-grid.tsx`
- 📦 `dependency-lines.tsx`
- 📦 `dependency-picker.tsx`
- 📦 `sortable-subtask-list.tsx`
- 📦 `types.ts`
- 📦 `utils.ts`

---

## 🎯 Final Shared UI Structure

```
src/components/task/gantt/
├── gantt-chart.tsx              # ✅ Already moved
├── draggable-subtask-bar.tsx    # ⏳ To move
├── subtask-bar.tsx              # ⏳ To move
├── task-row.tsx                 # ⏳ To move
├── timeline-grid.tsx            # ⏳ To move
├── dependency-lines.tsx         # ⏳ To move
├── dependency-picker.tsx        # ⏳ To move
├── sortable-subtask-list.tsx    # ⏳ To move
├── types.ts                     # ⏳ To move
└── utils.ts                     # ⏳ To move
```

---

## 🔄 Project Container Structure

```
src/app/w/[workspaceId]/p/[slug]/_components/gantt/
├── gantt-server-wrapper.tsx     # 🔒 Keep (data fetching)
└── gantt-container.tsx          # 🔒 Keep (pagination)
```

---

## ✅ Checklist

### **Gantt Components to Move**
- [ ] Move `draggable-subtask-bar.tsx` to `components/task/gantt/`
- [ ] Move `subtask-bar.tsx` to `components/task/gantt/`
- [ ] Move `task-row.tsx` to `components/task/gantt/`
- [ ] Move `timeline-grid.tsx` to `components/task/gantt/`
- [ ] Move `dependency-lines.tsx` to `components/task/gantt/`
- [ ] Move `dependency-picker.tsx` to `components/task/gantt/`
- [ ] Move `sortable-subtask-list.tsx` to `components/task/gantt/`
- [ ] Move `types.ts` to `components/task/gantt/`
- [ ] Move `utils.ts` to `components/task/gantt/`
- [ ] Update all imports

### **Gantt Containers to Keep**
- [x] Keep `gantt-server-wrapper.tsx` in project (data fetching)
- [x] Keep `gantt-container.tsx` in project (pagination)

---

**Gantt has the most components!** 🎉
