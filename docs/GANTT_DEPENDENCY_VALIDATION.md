# Gantt Chart: Manual Dependency Validation Algorithm

## Core Principle

**Planned dates are sacred.** They never change automatically, even if dependencies are delayed. Dependencies only control whether a task is *allowed* to start or complete — they don't reschedule anything.

---

## Task Structure

Each task has:

| Field | Description |
|-------|-------------|
| `plannedStartDate` | When the task is scheduled to start |
| `plannedDuration` | How many days the task takes |
| `plannedEndDate` | Computed: `plannedStartDate + plannedDuration` |
| `actualStartDate` | When work actually began (null if not started) |
| `actualEndDate` | When work actually finished (null if not complete) |
| `dependencies` | List of parent task IDs (Finish-to-Start) |
| `status` | `PENDING` | `IN_PROGRESS` | `BLOCKED` | `COMPLETED` |

---

## Dependency Type: Finish-to-Start (FS)

This is the most common dependency:

> **A child task cannot start until all parent tasks are COMPLETED.**

```
Parent Task:  [████████████]────────────────────┐
                                                │ (must finish first)
Child Task:   ░░░░░░░░░░░░░░░░░░░░░░░[████████] ←
              ^                       ^
              Planned Start           Can only start after parent finishes
              (doesn't change)
```

---

## Validation Rules

### 1. Can a Task START?

```
canStart(task):
    for each parentTaskId in task.dependencies:
        parent = getTask(parentTaskId)
        if parent.status != COMPLETED:
            return FALSE (blocked)
    return TRUE (can start)
```

**In plain English:** A task can only start if ALL its parent tasks have finished.

### 2. Can a Task COMPLETE?

```
canComplete(task):
    if task.actualStartDate is null:
        return FALSE (hasn't started)
    return TRUE (can complete anytime after starting)
```

### 3. Determine Task Status

```
getStatus(task):
    if task.actualEndDate exists:
        return COMPLETED
    
    if task.actualStartDate exists:
        return IN_PROGRESS
    
    if not canStart(task):
        return BLOCKED
    
    return PENDING (ready to start)
```

---

## Real-Time Validation vs. Planned Schedule

| Aspect | Planned Schedule | Real-Time Validation |
|--------|------------------|----------------------|
| Purpose | Original timeline | Current reality |
| Dates | Fixed, never auto-change | Tracks actual progress |
| Dependencies | Define order | Block/unblock tasks |
| Changes | Manual only | Automatic status updates |

**Key Insight:** The planned schedule is your *baseline*. Real-time validation tells you if you're on track or blocked.

---

## What Happens When a Parent Task Delays?

### Scenario

```
Project Timeline:
├── Task A (Parent)
│   Planned: Dec 1 - Dec 5
│   Actual:  Dec 1 - Dec 10 (delayed 5 days!)
│
└── Task B (Child, depends on A)
    Planned: Dec 6 - Dec 10
    Status:  ??? 
```

### Result

| What Happens | What Stays the Same |
|--------------|---------------------|
| Task B marked as `BLOCKED` | Task B's planned dates (Dec 6-10) |
| Warning shown: "Waiting for Task A" | Original schedule preserved |
| User sees delay impact | Historical baseline intact |

### Visual Representation

```
Timeline:     Dec 1   Dec 5   Dec 10   Dec 15
              ─────────────────────────────────
Task A Plan:  [█████]
Task A Actual:[█████████████]    (delayed)
                           │
Task B Plan:        [█████]│     (dates unchanged)
Task B Actual:      ░░░░░░░░     (blocked, can't start)
                    ^^^^^^^
                    Blocked indicator
```

---

## Showing Warnings Without Changing Dates

### Option 1: Status Badge
```
┌─────────────────────────────────────┐
│ Task B: Website Development         │
│ ⚠️ BLOCKED - Waiting for: Task A   │
│ Planned: Dec 6 - Dec 10            │
└─────────────────────────────────────┘
```

### Option 2: Visual Overlay on Bar
```
[░░░░░░░░░░]  ← Gray/striped bar = blocked
[██████████]  ← Solid bar = can proceed
```

### Option 3: Tooltip Warning
```
Hover on Task B bar:
┌────────────────────────────────────┐
│ ⚠️ Dependencies not met           │
│ Blocked by: Task A (In Progress)  │
│ Expected unblock: When A finishes │
└────────────────────────────────────┘
```

---

## Simple Example in Everyday Language

### The Scenario: Building a House

**Task A: Pour Foundation** (Parent)
- Planned: January 1-5
- Duration: 5 days

**Task B: Build Walls** (Child, depends on A)
- Planned: January 6-12
- Duration: 7 days

### What Happens

1. **January 1:** Task A starts on time ✅

2. **January 5:** Task A should finish, but there's a concrete shortage.
   - Task A status: `IN_PROGRESS` (still working)
   - Task B status: `BLOCKED` (can't build walls without foundation)
   - Task B planned dates: `January 6-12` (unchanged!)

3. **January 8:** Task A finally finishes.
   - Task A status: `COMPLETED`
   - Task B status: Changes from `BLOCKED` → `PENDING` (can now start)
   - Task B planned dates: Still `January 6-12` (we don't hide the delay)

4. **The Reality:**
   - Task B was **planned** for Jan 6-12
   - Task B will **actually** start Jan 8 (2 days late)
   - The system shows this gap as a **warning**, not an auto-reschedule

### What the User Sees

```
┌─────────────────────────────────────────────────────┐
│ Your Project Timeline                               │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Task A: Pour Foundation                             │
│ [██████████▓▓▓] ← Extended 3 days                  │
│  Jan 1    Jan 5  Jan 8                             │
│           ↑                                         │
│           Original end (missed)                    │
│                                                     │
│ Task B: Build Walls                                │
│ [░░░░░░░░░░░░░] ← Gray = was blocked              │
│  Jan 6        Jan 12                               │
│  ⚠️ Started 2 days late due to Task A delay       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Summary

```typescript
interface Task {
    id: string;
    name: string;
    plannedStartDate: Date;      // Never auto-changes
    plannedDuration: number;     // Never auto-changes
    plannedEndDate: Date;        // Computed, never auto-changes
    actualStartDate?: Date;      // Set when work begins
    actualEndDate?: Date;        // Set when work completes
    dependencies: string[];      // Parent task IDs
}

function validateTask(task: Task, allTasks: Task[]): ValidationResult {
    const blockers = task.dependencies
        .map(id => allTasks.find(t => t.id === id))
        .filter(parent => parent && parent.actualEndDate === null);
    
    return {
        canStart: blockers.length === 0,
        isBlocked: blockers.length > 0,
        blockedBy: blockers.map(t => t.name),
        status: determineStatus(task, blockers),
        warning: generateWarning(task, blockers)
    };
}
```

---

## Key Takeaways

1. **Planned dates never change automatically** — they're your baseline
2. **Dependencies block, they don't reschedule** — tasks wait, dates stay
3. **Show warnings, not silent changes** — users see the impact clearly
4. **Separate planned vs. actual** — track both to measure performance
5. **Status reflects reality** — BLOCKED shows what's waiting, not what's rescheduled

This approach keeps your project timeline honest and gives users full visibility into delays without hiding the original plan.
