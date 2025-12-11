# Production-Grade Gantt Chart - Complete Architecture & Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Data Model](#data-model)
3. [Component Structure](#component-structure)
4. [Scheduling Engine](#scheduling-engine)
5. [Dependency Management](#dependency-management)
6. [Performance Optimization](#performance-optimization)
7. [API Design](#api-design)
8. [Implementation Guide](#implementation-guide)
9. [Sample Code](#sample-code)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Gantt Chart Application                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   UI Layer   │  │  State Mgmt  │  │   API Layer  │      │
│  │              │  │              │  │              │      │
│  │ - Components │  │ - Redux/     │  │ - REST/      │      │
│  │ - Rendering  │  │   Zustand    │  │   GraphQL    │      │
│  │ - Events     │  │ - Selectors  │  │ - WebSocket  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│  ┌──────────────────────────────────────────────────┐      │
│  │           Business Logic Layer                    │      │
│  │                                                    │      │
│  │  ┌──────────────┐  ┌──────────────┐             │      │
│  │  │  Scheduling  │  │  Dependency  │             │      │
│  │  │   Engine     │  │   Manager    │             │      │
│  │  └──────────────┘  └──────────────┘             │      │
│  │                                                    │      │
│  │  ┌──────────────┐  ┌──────────────┐             │      │
│  │  │   Calendar   │  │   Critical   │             │      │
│  │  │   Manager    │  │     Path     │             │      │
│  │  └──────────────┘  └──────────────┘             │      │
│  └──────────────────────────────────────────────────┘      │
│         │                                                    │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Data Layer                           │      │
│  │                                                    │      │
│  │  - Task Store                                     │      │
│  │  - Dependency Store                               │      │
│  │  - Resource Store                                 │      │
│  │  - Calendar Store                                 │      │
│  │  - Baseline Store                                 │      │
│  └──────────────────────────────────────────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

```typescript
{
  "core": {
    "framework": "React 18+",
    "language": "TypeScript 5+",
    "stateManagement": "Zustand / Redux Toolkit",
    "styling": "Tailwind CSS + CSS Modules"
  },
  "performance": {
    "virtualization": "react-window / @tanstack/react-virtual",
    "memoization": "React.memo, useMemo, useCallback",
    "webWorkers": "For heavy calculations"
  },
  "utilities": {
    "dateHandling": "date-fns / dayjs",
    "dragAndDrop": "@dnd-kit/core",
    "canvas": "HTML5 Canvas for dependency lines",
    "export": "jsPDF, xlsx, html2canvas"
  },
  "testing": {
    "unit": "Vitest / Jest",
    "integration": "React Testing Library",
    "e2e": "Playwright"
  }
}
```

---

## 2. Data Model

### 2.1 Core Entities

#### Task Entity
```typescript
interface Task {
  // Identity
  id: string;
  projectId: string;
  
  // Hierarchy
  parentId: string | null;
  level: number;
  path: string; // e.g., "1.2.3"
  position: number; // Order within parent
  
  // Basic Info
  name: string;
  description?: string;
  type: 'task' | 'milestone' | 'summary';
  
  // Scheduling
  startDate: Date;
  endDate: Date;
  duration: number; // in days
  durationUnit: 'hours' | 'days' | 'weeks';
  
  // Constraints
  constraint: {
    type: 'ASAP' | 'ALAP' | 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO';
    date?: Date;
  };
  
  // Progress
  progress: number; // 0-100
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  
  // Resources
  assignedTo: string[]; // User IDs
  estimatedHours?: number;
  actualHours?: number;
  
  // Flags
  isMilestone: boolean;
  isCritical: boolean;
  isCollapsed: boolean;
  isManuallyScheduled: boolean; // Override auto-scheduling
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  
  // Calculated (not stored)
  slack?: number; // Total slack
  freeSlack?: number;
  earlyStart?: Date;
  earlyFinish?: Date;
  lateStart?: Date;
  lateFinish?: Date;
}
```

#### Dependency Entity
```typescript
interface Dependency {
  id: string;
  projectId: string;
  
  // Relationship
  predecessorId: string;
  successorId: string;
  
  // Type
  type: 'FS' | 'SS' | 'FF' | 'SF';
  // FS: Finish-to-Start (default)
  // SS: Start-to-Start
  // FF: Finish-to-Finish
  // SF: Start-to-Finish
  
  // Lag/Lead
  lag: number; // in days, can be negative (lead)
  lagUnit: 'hours' | 'days' | 'weeks';
  
  // Metadata
  createdAt: Date;
  createdBy: string;
}
```

#### Resource Entity
```typescript
interface Resource {
  id: string;
  name: string;
  email: string;
  role: string;
  
  // Availability
  workingHoursPerDay: number;
  availability: number; // 0-100%
  
  // Calendar
  calendarId: string;
  
  // Cost
  costPerHour?: number;
  
  // Metadata
  department?: string;
  skills?: string[];
}
```

#### Calendar Entity
```typescript
interface Calendar {
  id: string;
  name: string;
  isDefault: boolean;
  
  // Working days
  workingDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
  
  // Working hours
  workingHours: {
    start: string; // "09:00"
    end: string;   // "17:00"
  };
  
  // Exceptions
  holidays: Array<{
    date: Date;
    name: string;
    isRecurring: boolean;
  }>;
  
  // Special working days
  specialWorkingDays: Array<{
    date: Date;
    workingHours: {
      start: string;
      end: string;
    };
  }>;
}
```

#### Baseline Entity
```typescript
interface Baseline {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  
  // Snapshot of tasks
  tasks: Array<{
    taskId: string;
    startDate: Date;
    endDate: Date;
    duration: number;
    progress: number;
  }>;
}
```

### 2.2 View State
```typescript
interface GanttViewState {
  // Timeline
  timelineStart: Date;
  timelineEnd: Date;
  zoomLevel: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  
  // Scroll
  scrollLeft: number;
  scrollTop: number;
  
  // Selection
  selectedTaskIds: string[];
  focusedTaskId: string | null;
  
  // Filters
  filters: {
    status?: string[];
    assignedTo?: string[];
    tags?: string[];
    dateRange?: {
      start: Date;
      end: Date;
    };
  };
  
  // Display
  showCriticalPath: boolean;
  showBaseline: boolean;
  showSlack: boolean;
  showDependencies: boolean;
  
  // Columns
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  
  // Grouping
  groupBy?: 'status' | 'assignee' | 'tag' | 'none';
  
  // Expanded tasks
  expandedTaskIds: Set<string>;
}
```

---

## 3. Component Structure

### 3.1 Component Hierarchy

```
GanttChart (Root)
├── GanttHeader
│   ├── Toolbar
│   │   ├── ZoomControls
│   │   ├── ViewModeSelector
│   │   ├── FilterPanel
│   │   └── ExportButton
│   └── TimelineHeader
│       ├── ZoomLevelSelector
│       └── TimelineScale
│
├── GanttBody
│   ├── TaskListPanel (Left)
│   │   ├── TaskListHeader
│   │   │   └── ColumnHeaders (resizable)
│   │   └── VirtualizedTaskList
│   │       └── TaskRow (for each task)
│   │           ├── IndentationCell
│   │           ├── ExpandCollapseButton
│   │           ├── TaskNameCell (editable)
│   │           ├── StartDateCell (editable)
│   │           ├── EndDateCell (editable)
│   │           ├── DurationCell (editable)
│   │           ├── AssigneeCell
│   │           ├── StatusCell
│   │           └── ProgressCell
│   │
│   └── TimelinePanel (Right)
│       ├── TimelineGrid
│       │   ├── GridLines
│       │   ├── TodayMarker
│       │   └── NonWorkingDayOverlay
│       │
│       ├── VirtualizedTaskBars
│       │   └── TaskBar (for each task)
│       │       ├── DraggableBar
│       │       ├── ResizeHandles
│       │       ├── ProgressIndicator
│       │       └── MilestoneMarker
│       │
│       ├── DependencyLayer (Canvas)
│       │   └── DependencyArrow (for each dependency)
│       │
│       └── InteractionLayer
│           ├── SelectionBox
│           ├── DragPreview
│           └── ContextMenu
│
└── GanttFooter
    ├── StatusBar
    └── LegendPanel
```

### 3.2 Key Component Interfaces

```typescript
// Main Gantt Component
interface GanttChartProps {
  // Data
  tasks: Task[];
  dependencies: Dependency[];
  resources: Resource[];
  calendars: Calendar[];
  baselines?: Baseline[];
  
  // Configuration
  config: {
    defaultZoomLevel: ZoomLevel;
    workingDays: number[]; // 1-7 (Monday-Sunday)
    workingHours: { start: string; end: string };
    dateFormat: string;
    locale: string;
    theme: 'light' | 'dark';
  };
  
  // Callbacks
  onTaskCreate?: (task: Partial<Task>) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onTaskDelete?: (taskId: string) => void;
  onTaskMove?: (taskId: string, newStart: Date) => void;
  onTaskResize?: (taskId: string, newDuration: number) => void;
  
  onDependencyCreate?: (dependency: Omit<Dependency, 'id'>) => void;
  onDependencyDelete?: (dependencyId: string) => void;
  
  onSelectionChange?: (selectedTaskIds: string[]) => void;
  onTimelineScroll?: (scrollLeft: number) => void;
  onZoomChange?: (zoomLevel: ZoomLevel) => void;
  
  // Features
  features?: {
    enableDragDrop?: boolean;
    enableInlineEdit?: boolean;
    enableContextMenu?: boolean;
    enableKeyboardNav?: boolean;
    enableCriticalPath?: boolean;
    enableBaseline?: boolean;
    enableAutoSchedule?: boolean;
  };
  
  // Permissions
  permissions?: {
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canAssign?: boolean;
  };
}
```

---

## 4. Scheduling Engine

### 4.1 Scheduling Algorithm

```typescript
class SchedulingEngine {
  private tasks: Map<string, Task>;
  private dependencies: Map<string, Dependency[]>;
  private calendar: Calendar;
  
  /**
   * Main scheduling method
   * Uses Critical Path Method (CPM) algorithm
   */
  public schedule(
    tasks: Task[],
    dependencies: Dependency[],
    options: SchedulingOptions
  ): SchedulingResult {
    // 1. Build dependency graph
    const graph = this.buildDependencyGraph(tasks, dependencies);
    
    // 2. Topological sort to detect cycles
    const sortedTasks = this.topologicalSort(graph);
    if (!sortedTasks) {
      throw new Error('Circular dependency detected');
    }
    
    // 3. Forward pass - calculate early dates
    const earlyDates = this.forwardPass(sortedTasks, dependencies);
    
    // 4. Backward pass - calculate late dates
    const lateDates = this.backwardPass(sortedTasks, dependencies);
    
    // 5. Calculate slack and identify critical path
    const criticalPath = this.calculateCriticalPath(earlyDates, lateDates);
    
    // 6. Apply constraints
    const constrainedSchedule = this.applyConstraints(
      sortedTasks,
      earlyDates,
      lateDates
    );
    
    // 7. Resource leveling (optional)
    if (options.enableResourceLeveling) {
      return this.levelResources(constrainedSchedule);
    }
    
    return {
      tasks: constrainedSchedule,
      criticalPath,
      projectDuration: this.calculateProjectDuration(constrainedSchedule),
    };
  }
  
  /**
   * Forward pass - calculate earliest start/finish
   */
  private forwardPass(
    tasks: Task[],
    dependencies: Dependency[]
  ): Map<string, { earlyStart: Date; earlyFinish: Date }> {
    const result = new Map();
    
    for (const task of tasks) {
      let earlyStart = task.constraint.type === 'SNET' 
        ? task.constraint.date! 
        : this.projectStart;
      
      // Check all predecessors
      const predecessors = this.getPredecessors(task.id, dependencies);
      
      for (const pred of predecessors) {
        const predDates = result.get(pred.predecessorId);
        if (!predDates) continue;
        
        const dependentStart = this.calculateDependentStart(
          predDates,
          pred.type,
          pred.lag
        );
        
        if (dependentStart > earlyStart) {
          earlyStart = dependentStart;
        }
      }
      
      // Calculate early finish
      const earlyFinish = this.addWorkingDays(
        earlyStart,
        task.duration
      );
      
      result.set(task.id, { earlyStart, earlyFinish });
    }
    
    return result;
  }
  
  /**
   * Backward pass - calculate latest start/finish
   */
  private backwardPass(
    tasks: Task[],
    dependencies: Dependency[]
  ): Map<string, { lateStart: Date; lateFinish: Date }> {
    const result = new Map();
    const reversedTasks = [...tasks].reverse();
    
    for (const task of reversedTasks) {
      let lateFinish = task.constraint.type === 'FNLT'
        ? task.constraint.date!
        : this.projectEnd;
      
      // Check all successors
      const successors = this.getSuccessors(task.id, dependencies);
      
      for (const succ of successors) {
        const succDates = result.get(succ.successorId);
        if (!succDates) continue;
        
        const dependentFinish = this.calculateDependentFinish(
          succDates,
          succ.type,
          succ.lag
        );
        
        if (dependentFinish < lateFinish) {
          lateFinish = dependentFinish;
        }
      }
      
      // Calculate late start
      const lateStart = this.subtractWorkingDays(
        lateFinish,
        task.duration
      );
      
      result.set(task.id, { lateStart, lateFinish });
    }
    
    return result;
  }
  
  /**
   * Calculate dependent task start based on dependency type
   */
  private calculateDependentStart(
    predecessorDates: { earlyStart: Date; earlyFinish: Date },
    dependencyType: DependencyType,
    lag: number
  ): Date {
    let baseDate: Date;
    
    switch (dependencyType) {
      case 'FS': // Finish-to-Start
        baseDate = predecessorDates.earlyFinish;
        break;
      case 'SS': // Start-to-Start
        baseDate = predecessorDates.earlyStart;
        break;
      case 'FF': // Finish-to-Finish
        // For FF, we need to work backwards from finish
        baseDate = predecessorDates.earlyFinish;
        break;
      case 'SF': // Start-to-Finish
        baseDate = predecessorDates.earlyStart;
        break;
    }
    
    return this.addWorkingDays(baseDate, lag);
  }
  
  /**
   * Add working days considering calendar
   */
  private addWorkingDays(startDate: Date, days: number): Date {
    let current = new Date(startDate);
    let remaining = days;
    
    while (remaining > 0) {
      current = this.addDays(current, 1);
      
      if (this.isWorkingDay(current)) {
        remaining--;
      }
    }
    
    return current;
  }
  
  /**
   * Check if date is a working day
   */
  private isWorkingDay(date: Date): boolean {
    const dayOfWeek = date.getDay();
    
    // Check if it's a working day of week
    if (!this.calendar.workingDays[this.getDayName(dayOfWeek)]) {
      return false;
    }
    
    // Check if it's a holiday
    if (this.isHoliday(date)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Calculate critical path
   */
  private calculateCriticalPath(
    earlyDates: Map<string, any>,
    lateDates: Map<string, any>
  ): string[] {
    const criticalTasks: string[] = [];
    
    for (const [taskId, early] of earlyDates) {
      const late = lateDates.get(taskId);
      
      // Task is critical if total slack is zero
      const totalSlack = this.dateDiff(early.earlyStart, late.lateStart);
      
      if (totalSlack === 0) {
        criticalTasks.push(taskId);
      }
    }
    
    return criticalTasks;
  }
}
```

### 4.2 Auto-Scheduling Rules

```typescript
interface AutoScheduleRules {
  /**
   * When to trigger auto-schedule
   */
  triggers: {
    onTaskMove: boolean;
    onTaskResize: boolean;
    onDependencyAdd: boolean;
    onDependencyRemove: boolean;
    onTaskDelete: boolean;
  };
  
  /**
   * What to update
   */
  scope: {
    // Only update tasks that depend on the changed task
    dependentsOnly: boolean;
    
    // Update entire project
    fullProject: boolean;
    
    // Update only critical path tasks
    criticalPathOnly: boolean;
  };
  
  /**
   * Constraints to respect
   */
  constraints: {
    respectManualScheduling: boolean;
    respectTaskConstraints: boolean;
    respectResourceAvailability: boolean;
  };
}
```

---

## 5. Dependency Management

### 5.1 Dependency Types Implementation

```typescript
class DependencyManager {
  /**
   * Calculate successor task dates based on dependency type
   */
  public calculateSuccessorDates(
    predecessor: Task,
    successor: Task,
    dependency: Dependency
  ): { startDate: Date; endDate: Date } {
    const { type, lag } = dependency;
    let newStartDate: Date;
    let newEndDate: Date;
    
    switch (type) {
      case 'FS': // Finish-to-Start (most common)
        // Successor starts when predecessor finishes
        newStartDate = this.addWorkingDays(
          predecessor.endDate,
          lag + 1 // +1 because next working day
        );
        newEndDate = this.addWorkingDays(
          newStartDate,
          successor.duration - 1
        );
        break;
        
      case 'SS': // Start-to-Start
        // Successor starts when predecessor starts
        newStartDate = this.addWorkingDays(
          predecessor.startDate,
          lag
        );
        newEndDate = this.addWorkingDays(
          newStartDate,
          successor.duration - 1
        );
        break;
        
      case 'FF': // Finish-to-Finish
        // Successor finishes when predecessor finishes
        newEndDate = this.addWorkingDays(
          predecessor.endDate,
          lag
        );
        newStartDate = this.subtractWorkingDays(
          newEndDate,
          successor.duration - 1
        );
        break;
        
      case 'SF': // Start-to-Finish (rare)
        // Successor finishes when predecessor starts
        newEndDate = this.addWorkingDays(
          predecessor.startDate,
          lag
        );
        newStartDate = this.subtractWorkingDays(
          newEndDate,
          successor.duration - 1
        );
        break;
    }
    
    return { startDate: newStartDate, endDate: newEndDate };
  }
  
  /**
   * Validate dependency to prevent cycles
   */
  public validateDependency(
    predecessorId: string,
    successorId: string,
    existingDependencies: Dependency[]
  ): { valid: boolean; error?: string } {
    // Can't depend on self
    if (predecessorId === successorId) {
      return {
        valid: false,
        error: 'A task cannot depend on itself'
      };
    }
    
    // Check for circular dependency
    if (this.wouldCreateCycle(predecessorId, successorId, existingDependencies)) {
      return {
        valid: false,
        error: 'This dependency would create a circular reference'
      };
    }
    
    // Check for duplicate
    const duplicate = existingDependencies.find(
      d => d.predecessorId === predecessorId && d.successorId === successorId
    );
    
    if (duplicate) {
      return {
        valid: false,
        error: 'This dependency already exists'
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Detect circular dependencies using DFS
   */
  private wouldCreateCycle(
    from: string,
    to: string,
    dependencies: Dependency[]
  ): boolean {
    const graph = this.buildGraph(dependencies);
    
    // Add the proposed edge
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push(to);
    
    // Check for cycle using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      
      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    return hasCycle(from);
  }
}
```

### 5.2 Dependency Rendering

```typescript
class DependencyRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  /**
   * Draw dependency arrow between tasks
   */
  public drawDependency(
    from: TaskBarPosition,
    to: TaskBarPosition,
    dependency: Dependency,
    options: RenderOptions
  ): void {
    const { type, isHighlighted, isCritical } = options;
    
    // Calculate connection points
    const { start, end } = this.calculateConnectionPoints(from, to, type);
    
    // Draw path
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.getLineColor(isHighlighted, isCritical);
    this.ctx.lineWidth = isHighlighted ? 3 : 2;
    
    if (type === 'FS') {
      // Right-angle connector for FS
      this.drawRightAnglePath(start, end);
    } else {
      // Bezier curve for other types
      this.drawBezierPath(start, end);
    }
    
    this.ctx.stroke();
    
    // Draw arrow head
    this.drawArrowHead(end, this.getArrowDirection(start, end));
    
    // Draw lag indicator if present
    if (dependency.lag !== 0) {
      this.drawLagIndicator(start, end, dependency.lag);
    }
  }
  
  /**
   * Calculate connection points based on dependency type
   */
  private calculateConnectionPoints(
    from: TaskBarPosition,
    to: TaskBarPosition,
    type: DependencyType
  ): { start: Point; end: Point } {
    let start: Point;
    let end: Point;
    
    switch (type) {
      case 'FS':
        start = { x: from.right, y: from.centerY };
        end = { x: to.left, y: to.centerY };
        break;
      case 'SS':
        start = { x: from.left, y: from.centerY };
        end = { x: to.left, y: to.centerY };
        break;
      case 'FF':
        start = { x: from.right, y: from.centerY };
        end = { x: to.right, y: to.centerY };
        break;
      case 'SF':
        start = { x: from.left, y: from.centerY };
        end = { x: to.right, y: to.centerY };
        break;
    }
    
    return { start, end };
  }
  
  /**
   * Draw right-angle path (Microsoft Project style)
   */
  private drawRightAnglePath(start: Point, end: Point): void {
    const midX = (start.x + end.x) / 2;
    
    this.ctx.moveTo(start.x, start.y);
    this.ctx.lineTo(midX, start.y);
    this.ctx.lineTo(midX, end.y);
    this.ctx.lineTo(end.x, end.y);
  }
}
```

---

## 6. Performance Optimization

### 6.1 Virtualization Strategy

```typescript
/**
 * Virtual scrolling for task list
 * Only renders visible rows + buffer
 */
class VirtualTaskList {
  private containerHeight: number;
  private rowHeight: number = 32;
  private overscan: number = 5; // Buffer rows
  
  public getVisibleRange(scrollTop: number, tasks: Task[]): {
    startIndex: number;
    endIndex: number;
    offsetY: number;
  } {
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this.rowHeight) - this.overscan
    );
    
    const visibleCount = Math.ceil(this.containerHeight / this.rowHeight);
    const endIndex = Math.min(
      tasks.length,
      startIndex + visibleCount + this.overscan * 2
    );
    
    const offsetY = startIndex * this.rowHeight;
    
    return { startIndex, endIndex, offsetY };
  }
  
  public getTotalHeight(taskCount: number): number {
    return taskCount * this.rowHeight;
  }
}

/**
 * Virtual scrolling for timeline
 * Only renders visible date range
 */
class VirtualTimeline {
  private containerWidth: number;
  private dayWidth: number; // Depends on zoom level
  
  public getVisibleDateRange(
    scrollLeft: number,
    timelineStart: Date
  ): { startDate: Date; endDate: Date } {
    const daysFromStart = Math.floor(scrollLeft / this.dayWidth);
    const visibleDays = Math.ceil(this.containerWidth / this.dayWidth);
    
    const startDate = addDays(timelineStart, daysFromStart);
    const endDate = addDays(startDate, visibleDays);
    
    return { startDate, endDate };
  }
}
```

### 6.2 Memoization & Optimization

```typescript
/**
 * Memoized selectors for expensive calculations
 */
const selectVisibleTasks = createSelector(
  [
    (state) => state.tasks,
    (state) => state.filters,
    (state) => state.expandedTaskIds,
  ],
  (tasks, filters, expandedIds) => {
    // Filter tasks
    let filtered = tasks.filter(task => {
      if (filters.status && !filters.status.includes(task.status)) {
        return false;
      }
      if (filters.assignedTo && !task.assignedTo.some(id => 
        filters.assignedTo!.includes(id)
      )) {
        return false;
      }
      return true;
    });
    
    // Remove collapsed children
    filtered = filtered.filter(task => {
      if (!task.parentId) return true;
      
      // Check if any ancestor is collapsed
      let current = task;
      while (current.parentId) {
        const parent = tasks.find(t => t.id === current.parentId);
        if (!parent) break;
        if (!expandedIds.has(parent.id)) return false;
        current = parent;
      }
      
      return true;
    });
    
    return filtered;
  }
);

/**
 * Debounced auto-schedule
 */
const debouncedSchedule = useMemo(
  () => debounce((tasks: Task[], dependencies: Dependency[]) => {
    const engine = new SchedulingEngine();
    const result = engine.schedule(tasks, dependencies, {
      enableResourceLeveling: false
    });
    
    dispatch(updateSchedule(result));
  }, 300),
  []
);
```

### 6.3 Web Worker for Heavy Calculations

```typescript
// scheduling.worker.ts
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SCHEDULE':
      const engine = new SchedulingEngine();
      const result = engine.schedule(
        payload.tasks,
        payload.dependencies,
        payload.options
      );
      
      self.postMessage({
        type: 'SCHEDULE_COMPLETE',
        payload: result
      });
      break;
      
    case 'CALCULATE_CRITICAL_PATH':
      const criticalPath = calculateCriticalPath(
        payload.tasks,
        payload.dependencies
      );
      
      self.postMessage({
        type: 'CRITICAL_PATH_COMPLETE',
        payload: criticalPath
      });
      break;
  }
});

// Usage in component
const schedulingWorker = useMemo(
  () => new Worker(new URL('./scheduling.worker.ts', import.meta.url)),
  []
);

useEffect(() => {
  schedulingWorker.onmessage = (event) => {
    const { type, payload } = event.data;
    
    if (type === 'SCHEDULE_COMPLETE') {
      dispatch(updateSchedule(payload));
    }
  };
}, []);

const scheduleProject = useCallback(() => {
  schedulingWorker.postMessage({
    type: 'SCHEDULE',
    payload: {
      tasks,
      dependencies,
      options: schedulingOptions
    }
  });
}, [tasks, dependencies]);
```

---

## 7. API Design

### 7.1 Public API

```typescript
/**
 * Main Gantt Chart API
 */
export interface GanttChartAPI {
  // Task Operations
  createTask(task: Partial<Task>): Promise<Task>;
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
  getTasks(filter?: TaskFilter): Task[];
  getTask(taskId: string): Task | null;
  
  // Dependency Operations
  createDependency(dependency: Omit<Dependency, 'id'>): Promise<Dependency>;
  deleteDependency(dependencyId: string): Promise<void>;
  getDependencies(taskId?: string): Dependency[];
  
  // Scheduling
  scheduleProject(options?: SchedulingOptions): Promise<SchedulingResult>;
  calculateCriticalPath(): string[];
  
  // View Operations
  zoomIn(): void;
  zoomOut(): void;
  setZoomLevel(level: ZoomLevel): void;
  scrollToTask(taskId: string): void;
  scrollToDate(date: Date): void;
  fitToScreen(): void;
  
  // Selection
  selectTask(taskId: string): void;
  selectTasks(taskIds: string[]): void;
  clearSelection(): void;
  getSelectedTasks(): Task[];
  
  // Expand/Collapse
  expandTask(taskId: string): void;
  collapseTask(taskId: string): void;
  expandAll(): void;
  collapseAll(): void;
  
  // Export/Import
  exportToJSON(): string;
  exportToCSV(): string;
  exportToPNG(): Promise<Blob>;
  importFromJSON(json: string): Promise<void>;
  importFromCSV(csv: string): Promise<void>;
  
  // Baseline
  createBaseline(name: string): Promise<Baseline>;
  showBaseline(baselineId: string): void;
  hideBaseline(): void;
  
  // Undo/Redo
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}
```

### 7.2 Event System

```typescript
/**
 * Event emitter for Gantt Chart
 */
export interface GanttEvents {
  // Task events
  'task:create': (task: Task) => void;
  'task:update': (task: Task, changes: Partial<Task>) => void;
  'task:delete': (taskId: string) => void;
  'task:move': (taskId: string, oldStart: Date, newStart: Date) => void;
  'task:resize': (taskId: string, oldDuration: number, newDuration: number) => void;
  'task:select': (taskIds: string[]) => void;
  
  // Dependency events
  'dependency:create': (dependency: Dependency) => void;
  'dependency:delete': (dependencyId: string) => void;
  
  // View events
  'timeline:scroll': (scrollLeft: number, scrollTop: number) => void;
  'zoom:change': (oldLevel: ZoomLevel, newLevel: ZoomLevel) => void;
  
  // Schedule events
  'schedule:start': () => void;
  'schedule:complete': (result: SchedulingResult) => void;
  'schedule:error': (error: Error) => void;
  
  // Interaction events
  'drag:start': (taskId: string) => void;
  'drag:end': (taskId: string, newPosition: Date) => void;
  'resize:start': (taskId: string) => void;
  'resize:end': (taskId: string, newDuration: number) => void;
}

// Usage
const ganttRef = useRef<GanttChartAPI>(null);

ganttRef.current?.on('task:update', (task, changes) => {
  console.log('Task updated:', task.id, changes);
  // Sync with backend
  api.updateTask(task.id, changes);
});
```

---

## 8. Implementation Guide

### 8.1 Phase 1: Core Infrastructure (Week 1-2)

**Tasks:**
1. Set up project structure
2. Implement data models
3. Create state management (Zustand store)
4. Build basic component hierarchy
5. Implement timeline grid
6. Add basic task rendering

**Deliverables:**
- Static Gantt chart with hardcoded data
- Timeline with zoom levels
- Task list panel
- Synchronized scrolling

### 8.2 Phase 2: Interactions (Week 3-4)

**Tasks:**
1. Implement drag-and-drop for tasks
2. Add resize handles
3. Inline editing for task fields
4. Context menu
5. Keyboard navigation
6. Selection system

**Deliverables:**
- Fully interactive task bars
- Editable task properties
- Multi-select support

### 8.3 Phase 3: Dependencies (Week 5-6)

**Tasks:**
1. Implement dependency data structure
2. Build dependency renderer (Canvas)
3. Visual dependency creation (drag from circle)
4. Dependency validation
5. All dependency types (FS, SS, FF, SF)

**Deliverables:**
- Visual dependency arrows
- Drag-to-connect functionality
- Dependency type selector

### 8.4 Phase 4: Scheduling Engine (Week 7-8)

**Tasks:**
1. Implement CPM algorithm
2. Forward/backward pass
3. Critical path calculation
4. Auto-scheduling logic
5. Calendar integration
6. Working days/hours

**Deliverables:**
- Automatic task scheduling
- Critical path highlighting
- Respect for calendars and constraints

### 8.5 Phase 5: Performance & Polish (Week 9-10)

**Tasks:**
1. Implement virtualization
2. Add Web Workers for calculations
3. Optimize rendering
4. Add animations
5. Accessibility improvements
6. Testing

**Deliverables:**
- Handles 2000+ tasks smoothly
- Smooth animations
- WCAG 2.1 AA compliance

### 8.6 Phase 6: Advanced Features (Week 11-12)

**Tasks:**
1. Baseline support
2. Resource management
3. Export/Import
4. Undo/Redo
5. Advanced filtering
6. Custom columns

**Deliverables:**
- Full feature parity with Microsoft Project
- Export to multiple formats
- Complete documentation

---

## 9. Sample Code

### 9.1 Main Gantt Component

```typescript
// GanttChart.tsx
import React, { useRef, useCallback, useEffect } from 'react';
import { useGanttStore } from './store/ganttStore';
import { TaskListPanel } from './components/TaskListPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { GanttHeader } from './components/GanttHeader';
import { SchedulingEngine } from './engine/SchedulingEngine';
import { DependencyManager } from './engine/DependencyManager';

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks: initialTasks,
  dependencies: initialDependencies,
  config,
  onTaskUpdate,
  onDependencyCreate,
  features = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const schedulingEngine = useRef(new SchedulingEngine());
  const dependencyManager = useRef(new DependencyManager());
  
  const {
    tasks,
    dependencies,
    viewState,
    setTasks,
    setDependencies,
    updateTask,
    createDependency,
    setViewState,
  } = useGanttStore();
  
  // Initialize data
  useEffect(() => {
    setTasks(initialTasks);
    setDependencies(initialDependencies);
  }, [initialTasks, initialDependencies]);
  
  // Handle task move
  const handleTaskMove = useCallback(async (
    taskId: string,
    newStartDate: Date
  ) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const duration = task.duration;
    const newEndDate = addDays(newStartDate, duration - 1);
    
    // Update task
    const updates = {
      startDate: newStartDate,
      endDate: newEndDate,
    };
    
    updateTask(taskId, updates);
    
    // Auto-schedule dependent tasks if enabled
    if (features.enableAutoSchedule) {
      const affectedTasks = await schedulingEngine.current.scheduleDependent(
        taskId,
        tasks,
        dependencies
      );
      
      affectedTasks.forEach(({ id, startDate, endDate }) => {
        updateTask(id, { startDate, endDate });
      });
    }
    
    // Notify parent
    onTaskUpdate?.(taskId, updates);
  }, [tasks, dependencies, features.enableAutoSchedule]);
  
  // Handle task resize
  const handleTaskResize = useCallback(async (
    taskId: string,
    newDuration: number
  ) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newEndDate = addDays(task.startDate, newDuration - 1);
    
    const updates = {
      duration: newDuration,
      endDate: newEndDate,
    };
    
    updateTask(taskId, updates);
    
    // Auto-schedule dependent tasks
    if (features.enableAutoSchedule) {
      const affectedTasks = await schedulingEngine.current.scheduleDependent(
        taskId,
        tasks,
        dependencies
      );
      
      affectedTasks.forEach(({ id, startDate, endDate }) => {
        updateTask(id, { startDate, endDate });
      });
    }
    
    onTaskUpdate?.(taskId, updates);
  }, [tasks, dependencies, features.enableAutoSchedule]);
  
  // Handle dependency creation
  const handleDependencyCreate = useCallback(async (
    fromTaskId: string,
    toTaskId: string,
    type: DependencyType = 'FS'
  ) => {
    // Validate
    const validation = dependencyManager.current.validateDependency(
      fromTaskId,
      toTaskId,
      dependencies
    );
    
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    
    // Create dependency
    const dependency: Omit<Dependency, 'id'> = {
      projectId: config.projectId,
      predecessorId: fromTaskId,
      successorId: toTaskId,
      type,
      lag: 0,
      lagUnit: 'days',
      createdAt: new Date(),
      createdBy: config.userId,
    };
    
    const created = await createDependency(dependency);
    
    // Auto-schedule successor
    if (features.enableAutoSchedule) {
      const fromTask = tasks.find(t => t.id === fromTaskId);
      const toTask = tasks.find(t => t.id === toTaskId);
      
      if (fromTask && toTask) {
        const newDates = dependencyManager.current.calculateSuccessorDates(
          fromTask,
          toTask,
          created
        );
        
        updateTask(toTaskId, newDates);
      }
    }
    
    onDependencyCreate?.(created);
  }, [tasks, dependencies, features.enableAutoSchedule]);
  
  // Synchronized scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollTop } = e.currentTarget;
    
    setViewState({
      scrollLeft,
      scrollTop,
    });
  }, []);
  
  return (
    <div
      ref={containerRef}
      className="gantt-chart"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <GanttHeader
        zoomLevel={viewState.zoomLevel}
        onZoomChange={(level) => setViewState({ zoomLevel: level })}
        onExport={() => {/* Export logic */}}
      />
      
      <div
        className="gantt-body"
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        <TaskListPanel
          tasks={tasks}
          selectedTaskIds={viewState.selectedTaskIds}
          expandedTaskIds={viewState.expandedTaskIds}
          onTaskUpdate={handleTaskMove}
          scrollTop={viewState.scrollTop}
        />
        
        <TimelinePanel
          tasks={tasks}
          dependencies={dependencies}
          viewState={viewState}
          onTaskMove={handleTaskMove}
          onTaskResize={handleTaskResize}
          onDependencyCreate={handleDependencyCreate}
          onScroll={handleScroll}
        />
      </div>
    </div>
  );
};
```

### 9.2 Zustand Store

```typescript
// store/ganttStore.ts
import create from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface GanttState {
  // Data
  tasks: Task[];
  dependencies: Dependency[];
  resources: Resource[];
  
  // View state
  viewState: GanttViewState;
  
  // Actions
  setTasks: (tasks: Task[]) => void;
  setDependencies: (dependencies: Dependency[]) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  createDependency: (dependency: Omit<Dependency, 'id'>) => Promise<Dependency>;
  deleteDependency: (dependencyId: string) => void;
  setViewState: (updates: Partial<GanttViewState>) => void;
  
  // Computed
  getVisibleTasks: () => Task[];
  getCriticalPath: () => string[];
}

export const useGanttStore = create<GanttState>()(
  immer((set, get) => ({
    tasks: [],
    dependencies: [],
    resources: [],
    
    viewState: {
      timelineStart: new Date(),
      timelineEnd: addMonths(new Date(), 6),
      zoomLevel: 'day',
      scrollLeft: 0,
      scrollTop: 0,
      selectedTaskIds: [],
      focusedTaskId: null,
      filters: {},
      showCriticalPath: false,
      showBaseline: false,
      showSlack: false,
      showDependencies: true,
      visibleColumns: ['name', 'start', 'end', 'duration', 'assignee'],
      columnWidths: {},
      expandedTaskIds: new Set(),
    },
    
    setTasks: (tasks) => set({ tasks }),
    
    setDependencies: (dependencies) => set({ dependencies }),
    
    updateTask: (taskId, updates) => set((state) => {
      const task = state.tasks.find(t => t.id === taskId);
      if (task) {
        Object.assign(task, updates);
        task.updatedAt = new Date();
      }
    }),
    
    deleteTask: (taskId) => set((state) => {
      state.tasks = state.tasks.filter(t => t.id !== taskId);
      state.dependencies = state.dependencies.filter(
        d => d.predecessorId !== taskId && d.successorId !== taskId
      );
    }),
    
    createDependency: async (dependency) => {
      const newDependency: Dependency = {
        ...dependency,
        id: generateId(),
      };
      
      set((state) => {
        state.dependencies.push(newDependency);
      });
      
      return newDependency;
    },
    
    deleteDependency: (dependencyId) => set((state) => {
      state.dependencies = state.dependencies.filter(
        d => d.id !== dependencyId
      );
    }),
    
    setViewState: (updates) => set((state) => {
      Object.assign(state.viewState, updates);
    }),
    
    getVisibleTasks: () => {
      const { tasks, viewState } = get();
      
      // Apply filters
      let filtered = tasks.filter(task => {
        // Filter logic
        return true;
      });
      
      // Remove collapsed children
      filtered = filtered.filter(task => {
        if (!task.parentId) return true;
        
        let current = task;
        while (current.parentId) {
          const parent = tasks.find(t => t.id === current.parentId);
          if (!parent) break;
          if (!viewState.expandedTaskIds.has(parent.id)) return false;
          current = parent;
        }
        
        return true;
      });
      
      return filtered;
    },
    
    getCriticalPath: () => {
      const { tasks, dependencies } = get();
      const engine = new SchedulingEngine();
      return engine.calculateCriticalPath(tasks, dependencies);
    },
  }))
);
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
describe('SchedulingEngine', () => {
  let engine: SchedulingEngine;
  
  beforeEach(() => {
    engine = new SchedulingEngine();
  });
  
  it('should calculate early dates correctly', () => {
    const tasks: Task[] = [
      { id: '1', startDate: new Date('2024-01-01'), duration: 5 },
      { id: '2', startDate: new Date('2024-01-01'), duration: 3 },
    ];
    
    const dependencies: Dependency[] = [
      { predecessorId: '1', successorId: '2', type: 'FS', lag: 0 },
    ];
    
    const result = engine.schedule(tasks, dependencies, {});
    
    expect(result.tasks[1].startDate).toEqual(new Date('2024-01-06'));
  });
  
  it('should detect circular dependencies', () => {
    const dependencies: Dependency[] = [
      { predecessorId: '1', successorId: '2', type: 'FS', lag: 0 },
      { predecessorId: '2', successorId: '3', type: 'FS', lag: 0 },
      { predecessorId: '3', successorId: '1', type: 'FS', lag: 0 },
    ];
    
    expect(() => {
      engine.schedule(tasks, dependencies, {});
    }).toThrow('Circular dependency detected');
  });
});
```

### 10.2 Integration Tests

```typescript
describe('Gantt Chart Integration', () => {
  it('should update dependent tasks when predecessor moves', async () => {
    const { getByTestId } = render(
      <GanttChart
        tasks={mockTasks}
        dependencies={mockDependencies}
        features={{ enableAutoSchedule: true }}
      />
    );
    
    const task1 = getByTestId('task-1');
    
    // Drag task 1 to new position
    fireEvent.dragStart(task1);
    fireEvent.dragEnd(task1, { clientX: 200 });
    
    await waitFor(() => {
      const task2 = getByTestId('task-2');
      expect(task2).toHaveAttribute('data-start-date', '2024-01-10');
    });
  });
});
```

---

## 11. Deployment Checklist

- [ ] Performance audit (Lighthouse score > 90)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile responsiveness
- [ ] Documentation complete
- [ ] API documentation
- [ ] Example projects
- [ ] Migration guide
- [ ] Bundle size optimization
- [ ] CDN setup
- [ ] npm package published

---

## 12. Future Enhancements

1. **Real-time Collaboration**
   - WebSocket integration
   - Operational Transform for conflict resolution
   - User presence indicators

2. **Advanced Resource Management**
   - Resource histograms
   - Capacity planning
   - Cost tracking

3. **AI-Powered Features**
   - Smart scheduling suggestions
   - Risk prediction
   - Automatic task breakdown

4. **Mobile App**
   - React Native version
   - Offline support
   - Push notifications

---

This architecture provides a complete foundation for building a production-grade Gantt chart. The modular design allows for incremental implementation while maintaining code quality and performance.
