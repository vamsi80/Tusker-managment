# Gantt Chart Upgrade Roadmap
## From Current Implementation to Production-Grade Architecture

---

## Current State Analysis

### ✅ What You Already Have

**Components:**
- ✅ `gantt-chart.tsx` - Main container
- ✅ `timeline-grid.tsx` - Timeline rendering
- ✅ `task-row.tsx` - Task row rendering
- ✅ `draggable-subtask-bar.tsx` - Interactive task bars
- ✅ `dependency-lines.tsx` - Dependency visualization
- ✅ `dependency-picker.tsx` - Dependency management UI
- ✅ `sortable-subtask-list.tsx` - Drag-and-drop reordering

**Features:**
- ✅ Basic timeline with 3 zoom levels (days, weeks, months)
- ✅ Drag to move tasks
- ✅ Resize to change duration
- ✅ Visual dependency creation
- ✅ Dependency lines (FS type only)
- ✅ Task expansion/collapse
- ✅ Synchronized scrolling

**Data Layer:**
- ✅ Basic task/subtask structure
- ✅ Dependency tracking (FS only)
- ✅ Server actions for updates

### ❌ What's Missing (vs Production Architecture)

**Critical Missing Features:**
1. ❌ Advanced dependency types (SS, FF, SF)
2. ❌ Scheduling engine (CPM algorithm)
3. ❌ Critical path calculation
4. ❌ Auto-scheduling of dependent tasks
5. ❌ Calendar/working days support
6. ❌ Virtualization for performance
7. ❌ Resource management
8. ❌ Baseline support
9. ❌ Export/Import functionality
10. ❌ Undo/Redo system

---

## Upgrade Plan - Phased Approach

### Phase 1: Enhanced Data Model (Week 1)
**Priority: HIGH**

#### 1.1 Upgrade Types
Create `types-v2.ts` with enhanced data structures:

```typescript
// Enhanced Task Type
export interface GanttTask {
  // Identity
  id: string;
  projectId: string;
  parentId: string | null;
  level: number;
  position: number;
  
  // Basic Info
  name: string;
  description?: string;
  type: 'task' | 'milestone' | 'summary';
  
  // Scheduling
  startDate: Date;
  endDate: Date;
  duration: number; // in days
  
  // Progress
  progress: number; // 0-100
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold';
  
  // Resources
  assignedTo: string[];
  
  // Flags
  isMilestone: boolean;
  isCritical: boolean; // NEW
  isCollapsed: boolean;
  isManuallyScheduled: boolean; // NEW - Override auto-scheduling
  
  // Calculated (not stored)
  slack?: number; // NEW
  earlyStart?: Date; // NEW
  earlyFinish?: Date; // NEW
  lateStart?: Date; // NEW
  lateFinish?: Date; // NEW
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// Enhanced Dependency Type
export interface GanttDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF'; // NEW - All 4 types
  lag: number; // NEW - in days, can be negative
  createdAt: Date;
}

// NEW - Calendar Type
export interface Calendar {
  id: string;
  name: string;
  workingDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
  holidays: Array<{
    date: Date;
    name: string;
  }>;
}

// NEW - Baseline Type
export interface Baseline {
  id: string;
  name: string;
  createdAt: Date;
  tasks: Array<{
    taskId: string;
    startDate: Date;
    endDate: Date;
    progress: number;
  }>;
}
```

**Files to Create:**
- `src/app/w/[workspaceId]/p/[slug]/task/_components/gantt/types-v2.ts`

**Migration Strategy:**
- Keep existing `types.ts` for backward compatibility
- Gradually migrate components to use `types-v2.ts`
- Create adapter functions to convert between old and new types

---

### Phase 2: Scheduling Engine (Week 2-3)
**Priority: HIGH**

#### 2.1 Create Scheduling Engine

```typescript
// scheduling-engine.ts
export class SchedulingEngine {
  /**
   * Calculate early/late dates using CPM
   */
  public calculateSchedule(
    tasks: GanttTask[],
    dependencies: GanttDependency[],
    calendar: Calendar
  ): ScheduleResult {
    // 1. Build dependency graph
    const graph = this.buildGraph(tasks, dependencies);
    
    // 2. Topological sort
    const sorted = this.topologicalSort(graph);
    
    // 3. Forward pass - early dates
    const earlyDates = this.forwardPass(sorted, dependencies, calendar);
    
    // 4. Backward pass - late dates
    const lateDates = this.backwardPass(sorted, dependencies, calendar);
    
    // 5. Calculate slack
    const slack = this.calculateSlack(earlyDates, lateDates);
    
    // 6. Identify critical path
    const criticalPath = this.findCriticalPath(slack);
    
    return {
      tasks: this.mergeDates(tasks, earlyDates, lateDates, slack),
      criticalPath,
      projectDuration: this.calculateDuration(earlyDates, lateDates),
    };
  }
  
  /**
   * Forward pass - calculate earliest start/finish
   */
  private forwardPass(
    tasks: GanttTask[],
    dependencies: GanttDependency[],
    calendar: Calendar
  ): Map<string, { earlyStart: Date; earlyFinish: Date }> {
    const result = new Map();
    
    for (const task of tasks) {
      let earlyStart = task.startDate;
      
      // Check all predecessors
      const predecessors = this.getPredecessors(task.id, dependencies);
      
      for (const pred of predecessors) {
        const predDates = result.get(pred.predecessorId);
        if (!predDates) continue;
        
        const dependentStart = this.calculateDependentDate(
          predDates,
          pred.type,
          pred.lag,
          calendar
        );
        
        if (dependentStart > earlyStart) {
          earlyStart = dependentStart;
        }
      }
      
      const earlyFinish = this.addWorkingDays(
        earlyStart,
        task.duration,
        calendar
      );
      
      result.set(task.id, { earlyStart, earlyFinish });
    }
    
    return result;
  }
  
  /**
   * Add working days considering calendar
   */
  private addWorkingDays(
    startDate: Date,
    days: number,
    calendar: Calendar
  ): Date {
    let current = new Date(startDate);
    let remaining = days;
    
    while (remaining > 0) {
      current = addDays(current, 1);
      
      if (this.isWorkingDay(current, calendar)) {
        remaining--;
      }
    }
    
    return current;
  }
  
  /**
   * Check if date is a working day
   */
  private isWorkingDay(date: Date, calendar: Calendar): boolean {
    const dayOfWeek = date.getDay();
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
    
    // Check working days
    if (!calendar.workingDays[dayName]) {
      return false;
    }
    
    // Check holidays
    const isHoliday = calendar.holidays.some(h => 
      isSameDay(h.date, date)
    );
    
    return !isHoliday;
  }
}
```

**Files to Create:**
- `src/app/w/[workspaceId]/p/[slug]/task/_components/gantt/engine/scheduling-engine.ts`
- `src/app/w/[workspaceId]/p/[slug]/task/_components/gantt/engine/calendar-utils.ts`
- `src/app/w/[workspaceId]/p/[slug]/task/_components/gantt/engine/critical-path.ts`

**Integration Points:**
- Call scheduling engine when:
  - Task dates change
  - Dependencies are added/removed
  - Task duration changes
- Update `drag-actions.ts` to use scheduling engine

---

### Phase 3: Enhanced Dependency System (Week 4)
**Priority: HIGH**

#### 3.1 Support All Dependency Types

**Update `dependency-lines.tsx`:**
```typescript
// Add support for SS, FF, SF
const calculateConnectionPoints = (
  from: TaskPosition,
  to: TaskPosition,
  type: 'FS' | 'SS' | 'FF' | 'SF'
): { start: Point; end: Point } => {
  switch (type) {
    case 'FS': // Finish-to-Start
      return {
        start: { x: from.right, y: from.centerY },
        end: { x: to.left, y: to.centerY }
      };
    case 'SS': // Start-to-Start
      return {
        start: { x: from.left, y: from.centerY },
        end: { x: to.left, y: to.centerY }
      };
    case 'FF': // Finish-to-Finish
      return {
        start: { x: from.right, y: from.centerY },
        end: { x: to.right, y: to.centerY }
      };
    case 'SF': // Start-to-Finish
      return {
        start: { x: from.left, y: from.centerY },
        end: { x: to.right, y: to.centerY }
      };
  }
};
```

**Update `dependency-picker.tsx`:**
- Add dependency type selector (FS, SS, FF, SF)
- Add lag/lead input field
- Visual preview of dependency type

**Files to Modify:**
- `dependency-lines.tsx`
- `dependency-picker.tsx`
- `dependency-actions.ts` (add type and lag parameters)

---

### Phase 4: State Management (Week 5)
**Priority: MEDIUM**

#### 4.1 Implement Zustand Store

```typescript
// store/gantt-store.ts
import create from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface GanttState {
  // Data
  tasks: GanttTask[];
  dependencies: GanttDependency[];
  calendar: Calendar;
  baselines: Baseline[];
  
  // View state
  viewState: {
    zoomLevel: 'hour' | 'day' | 'week' | 'month' | 'quarter';
    scrollLeft: number;
    scrollTop: number;
    selectedTaskIds: string[];
    expandedTaskIds: Set<string>;
    showCriticalPath: boolean;
    showBaseline: boolean;
  };
  
  // History for undo/redo
  history: {
    past: GanttState[];
    future: GanttState[];
  };
  
  // Actions
  updateTask: (taskId: string, updates: Partial<GanttTask>) => void;
  createDependency: (dependency: Omit<GanttDependency, 'id'>) => void;
  deleteDependency: (id: string) => void;
  
  // Scheduling
  scheduleProject: () => void;
  scheduleDependents: (taskId: string) => void;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // View
  setZoomLevel: (level: ZoomLevel) => void;
  toggleCriticalPath: () => void;
  expandTask: (taskId: string) => void;
  collapseTask: (taskId: string) => void;
}

export const useGanttStore = create<GanttState>()(
  immer((set, get) => ({
    // ... implementation
  }))
);
```

**Files to Create:**
- `src/app/w/[workspaceId]/p/[slug]/task/_components/gantt/store/gantt-store.ts`
- `src/app/w/[workspaceId]/p/[slug]/task/_components/gantt/store/selectors.ts`
- `src/app/w/[workspaceId]/p/[slug]/task/_components/gantt/store/middleware.ts`

**Migration:**
- Move state from component props to Zustand store
- Update components to use store hooks
- Implement undo/redo middleware

---

### Phase 5: Performance Optimization (Week 6)
**Priority: HIGH**

#### 5.1 Implement Virtualization

**Install dependencies:**
```bash
pnpm add @tanstack/react-virtual
```

**Create virtualized task list:**
```typescript
// components/virtualized-task-list.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export const VirtualizedTaskList = ({ tasks }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // Row height
    overscan: 5, // Buffer rows
  });
  
  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const task = tasks[virtualRow.index];
          return (
            <div
              key={task.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <TaskRow task={task} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

**Files to Create:**
- `components/virtualized-task-list.tsx`
- `components/virtualized-timeline.tsx`

**Files to Modify:**
- `gantt-chart.tsx` - Use virtualized components
- `timeline-grid.tsx` - Support virtual scrolling

#### 5.2 Web Workers for Scheduling

```typescript
// workers/scheduling.worker.ts
import { SchedulingEngine } from '../engine/scheduling-engine';

self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  if (type === 'SCHEDULE') {
    const engine = new SchedulingEngine();
    const result = engine.calculateSchedule(
      payload.tasks,
      payload.dependencies,
      payload.calendar
    );
    
    self.postMessage({
      type: 'SCHEDULE_COMPLETE',
      payload: result,
    });
  }
});
```

**Files to Create:**
- `workers/scheduling.worker.ts`
- `hooks/use-scheduling-worker.ts`

---

### Phase 6: Advanced Features (Week 7-8)
**Priority: MEDIUM**

#### 6.1 Zoom Levels

**Add more zoom levels:**
```typescript
export type ZoomLevel = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

const zoomConfig: Record<ZoomLevel, {
  dayWidth: number;
  headerFormat: string;
  minorUnit: string;
}> = {
  hour: { dayWidth: 960, headerFormat: 'HH:mm', minorUnit: 'hour' },
  day: { dayWidth: 40, headerFormat: 'MMM dd', minorUnit: 'day' },
  week: { dayWidth: 20, headerFormat: 'MMM dd', minorUnit: 'week' },
  month: { dayWidth: 10, headerFormat: 'MMM yyyy', minorUnit: 'month' },
  quarter: { dayWidth: 3, headerFormat: 'Qx yyyy', minorUnit: 'quarter' },
  year: { dayWidth: 1, headerFormat: 'yyyy', minorUnit: 'year' },
};
```

#### 6.2 Baseline Support

```typescript
// components/baseline-overlay.tsx
export const BaselineOverlay = ({ baseline, tasks }: Props) => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {baseline.tasks.map((baselineTask) => {
        const currentTask = tasks.find(t => t.id === baselineTask.taskId);
        if (!currentTask) return null;
        
        return (
          <div
            key={baselineTask.taskId}
            className="absolute h-1 bg-gray-400 opacity-50"
            style={{
              left: `${calculatePosition(baselineTask.startDate)}%`,
              width: `${calculateWidth(baselineTask)}%`,
              top: `${getTaskY(baselineTask.taskId)}px`,
            }}
          />
        );
      })}
    </div>
  );
};
```

#### 6.3 Export/Import

```typescript
// utils/export.ts
export const exportToJSON = (tasks: GanttTask[], dependencies: GanttDependency[]) => {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    tasks,
    dependencies,
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gantt-${Date.now()}.json`;
  a.click();
};

export const exportToPNG = async (containerRef: RefObject<HTMLElement>) => {
  const html2canvas = (await import('html2canvas')).default;
  
  if (!containerRef.current) return;
  
  const canvas = await html2canvas(containerRef.current);
  canvas.toBlob((blob) => {
    if (!blob) return;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gantt-${Date.now()}.png`;
    a.click();
  });
};
```

---

## Implementation Priority Matrix

### Must Have (Phase 1-3) - Weeks 1-4
1. ✅ Enhanced data model
2. ✅ Scheduling engine with CPM
3. ✅ All dependency types (FS, SS, FF, SF)
4. ✅ Auto-scheduling
5. ✅ Calendar/working days

### Should Have (Phase 4-5) - Weeks 5-6
6. ✅ State management (Zustand)
7. ✅ Virtualization
8. ✅ Web Workers
9. ✅ Undo/Redo
10. ✅ Critical path visualization

### Nice to Have (Phase 6) - Weeks 7-8
11. ✅ Additional zoom levels
12. ✅ Baseline support
13. ✅ Export/Import
14. ✅ Resource management
15. ✅ Advanced filtering

---

## Migration Strategy

### Step 1: Parallel Implementation
- Keep existing components working
- Create new components with `-v2` suffix
- Test thoroughly before switching

### Step 2: Gradual Migration
- Migrate one component at a time
- Start with data layer (types, store)
- Then scheduling engine
- Finally UI components

### Step 3: Feature Flags
```typescript
const features = {
  useSchedulingEngine: true,
  useVirtualization: false, // Enable after testing
  useWebWorkers: false,
  showCriticalPath: true,
};
```

### Step 4: Testing
- Unit tests for scheduling engine
- Integration tests for auto-scheduling
- Performance tests with 2000+ tasks
- E2E tests for user workflows

---

## Quick Wins (Implement First)

### 1. Add Lag/Lead to Dependencies (2 hours)
- Update `GanttDependency` type
- Add lag input in dependency picker
- Update dependency calculation

### 2. Critical Path Highlighting (4 hours)
- Implement basic critical path calculation
- Highlight critical tasks in red
- Add toggle in toolbar

### 3. Working Days Calendar (4 hours)
- Create Calendar type
- Implement `isWorkingDay()` function
- Update date calculations

### 4. Zoom Level: Quarter & Year (2 hours)
- Add to `TimelineGranularity` type
- Update timeline header rendering
- Add zoom buttons

### 5. Export to JSON (1 hour)
- Implement export function
- Add export button to toolbar

---

## File Structure (After Upgrade)

```
gantt/
├── components/
│   ├── gantt-chart.tsx (main container)
│   ├── gantt-header.tsx (toolbar, zoom controls)
│   ├── task-list-panel.tsx (left panel)
│   ├── timeline-panel.tsx (right panel)
│   ├── virtualized-task-list.tsx (NEW)
│   ├── virtualized-timeline.tsx (NEW)
│   ├── baseline-overlay.tsx (NEW)
│   └── critical-path-overlay.tsx (NEW)
│
├── engine/
│   ├── scheduling-engine.ts (NEW - CPM algorithm)
│   ├── calendar-utils.ts (NEW)
│   ├── critical-path.ts (NEW)
│   └── dependency-calculator.ts (NEW)
│
├── store/
│   ├── gantt-store.ts (NEW - Zustand)
│   ├── selectors.ts (NEW)
│   └── middleware.ts (NEW - undo/redo)
│
├── workers/
│   └── scheduling.worker.ts (NEW)
│
├── utils/
│   ├── export.ts (NEW)
│   ├── import.ts (NEW)
│   └── date-utils.ts (enhanced)
│
├── types/
│   ├── types-v2.ts (NEW - enhanced types)
│   └── types.ts (existing - keep for compatibility)
│
└── hooks/
    ├── use-scheduling-worker.ts (NEW)
    ├── use-gantt-store.ts (NEW)
    └── use-virtualization.ts (NEW)
```

---

## Next Steps

1. **Review this roadmap** and prioritize features
2. **Start with Phase 1** (Enhanced Data Model)
3. **Implement Quick Wins** for immediate value
4. **Set up testing infrastructure**
5. **Create feature flags** for gradual rollout

Would you like me to start implementing any specific phase?
