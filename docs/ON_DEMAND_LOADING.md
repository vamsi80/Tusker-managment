# On-Demand Subtask Loading

## Overview
Subtasks are loaded **ONLY when needed** - not before. This ensures optimal performance and minimal database queries.

## How It Works

### Initial Page Load
```
┌─────────────────────────────────────────────────────────────┐
│ Server fetches ONLY parent tasks (no subtasks)             │
│ - Fast initial load                                        │
│ - Minimal data transfer                                    │
│ - Only 10 parent tasks per page                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ UI displays parent tasks                                    │
│                                                             │
│ ▶ Task 1 (collapsed)  ← No subtasks loaded yet            │
│ ▶ Task 2 (collapsed)  ← No subtasks loaded yet            │
│ ▶ Task 3 (collapsed)  ← No subtasks loaded yet            │
│                                                             │
│ NO DATABASE QUERIES FOR SUBTASKS YET!                      │
└─────────────────────────────────────────────────────────────┘
```

### User Expands a Task (First Time)
```
User clicks ▶ on Task 1
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Check: Are subtasks already loaded?                        │
│ Answer: NO                                                  │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Fetch subtasks from server (ON-DEMAND)                     │
│ - loadSubTasksAction(taskId, ...)                         │
│ - getSubTasks() from src/data/task                        │
│ - Database query ONLY for this task's subtasks            │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│ UI updates with subtasks                                    │
│                                                             │
│ ▼ Task 1 (expanded)                                        │
│   ├─ Subtask 1.1                                           │
│   ├─ Subtask 1.2                                           │
│   └─ Subtask 1.3                                           │
│ ▶ Task 2 (collapsed)  ← Still no subtasks loaded          │
│ ▶ Task 3 (collapsed)  ← Still no subtasks loaded          │
└─────────────────────────────────────────────────────────────┘
```

### User Expands Same Task Again (Already Loaded)
```
User collapses Task 1, then expands it again
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Check: Are subtasks already loaded?                        │
│ Answer: YES (cached in state)                              │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Just show the subtasks (NO FETCH)                          │
│ - No server request                                        │
│ - No database query                                        │
│ - Instant display from memory                              │
└─────────────────────────────────────────────────────────────┘
```

## Code Flow

### toggleExpand() Function Logic
```typescript
toggleExpand(taskId) {
    // Step 1: Toggle UI state
    setExpanded(!isExpanded);
    
    // Step 2: Check if we need to fetch
    if (expanding && !subtasksAlreadyLoaded) {
        // ✅ FETCH: Only when expanding AND not loaded
        loadSubTasksAction(taskId);
    } else if (expanding && subtasksAlreadyLoaded) {
        // ✅ NO FETCH: Just show existing data
        // (subtasks already in state)
    } else if (collapsing) {
        // ✅ NO FETCH: Just hide the subtasks
        // (keep data in state for next expand)
    }
}
```

## Decision Tree

```
User clicks on task
    │
    ├─ Is task currently expanded?
    │   ├─ YES → Collapse (NO FETCH)
    │   │         Just hide subtasks
    │   │
    │   └─ NO → Expanding...
    │       │
    │       ├─ Are subtasks already loaded?
    │       │   ├─ YES → Show existing (NO FETCH)
    │       │   │         Display from state
    │       │   │
    │       │   └─ NO → Fetch from server (FETCH!)
    │       │             loadSubTasksAction()
    │       │             ↓
    │       │             Database query
    │       │             ↓
    │       │             Update state
    │       │             ↓
    │       │             Display subtasks
```

## Performance Benefits

### Without On-Demand Loading (Bad)
```
Initial Load:
- Fetch all parent tasks: 100ms
- Fetch ALL subtasks for ALL tasks: 2000ms ❌
- Total: 2100ms
- Data transferred: 500KB

Problem: Fetching data user might never see!
```

### With On-Demand Loading (Good)
```
Initial Load:
- Fetch only parent tasks: 100ms ✅
- Total: 100ms
- Data transferred: 50KB

When user expands Task 1:
- Fetch subtasks for Task 1 only: 150ms ✅
- Data transferred: 20KB

Total for 1 task: 250ms (vs 2100ms)
Improvement: 88% faster! 🚀
```

## Real-World Example

### Scenario: Project with 50 parent tasks, each with 10 subtasks

#### Without On-Demand:
```
Initial load fetches:
- 50 parent tasks
- 500 subtasks (50 × 10)
- Database: 51 queries
- Time: ~3 seconds
- Data: 800KB
```

#### With On-Demand:
```
Initial load fetches:
- 10 parent tasks (first page)
- 0 subtasks
- Database: 1 query
- Time: ~200ms
- Data: 50KB

User expands 3 tasks:
- 3 additional queries (one per task)
- Time: ~150ms each
- Data: 60KB total

Total: 4 queries, 650ms, 110KB
Improvement: 92% less data, 78% faster!
```

## Code Implementation

### Current Implementation (Correct ✅)
```tsx
const toggleExpand = async (taskId: string) => {
    const isCurrentlyExpanded = expanded[taskId];
    setExpanded((prev) => ({ ...prev, [taskId]: !prev[taskId] }));

    // ✅ Only fetch when expanding
    if (!isCurrentlyExpanded) {
        const task = tasks.find((t) => t.id === taskId);
        
        // ✅ Only fetch if not already loaded
        if (task && !task.subTasks) {
            // Fetch from server
            const result = await loadSubTasksAction(...);
            
            // Update state
            setTasks(/* add subtasks to task */);
        }
    }
};
```

### What NOT to Do (Wrong ❌)
```tsx
// ❌ BAD: Fetch all subtasks on initial load
useEffect(() => {
    tasks.forEach(task => {
        loadSubTasksAction(task.id); // Fetches everything!
    });
}, []);

// ❌ BAD: Fetch every time user expands
const toggleExpand = async (taskId: string) => {
    // Always fetch, even if already loaded
    const result = await loadSubTasksAction(taskId);
};

// ❌ BAD: Prefetch subtasks
useEffect(() => {
    // Fetch subtasks for all visible tasks
    visibleTasks.forEach(task => {
        loadSubTasksAction(task.id);
    });
}, [visibleTasks]);
```

## State Management

### Task State Structure
```typescript
{
    id: "task-1",
    name: "Parent Task",
    subTasks: undefined,  // ← Not loaded yet
    // ... other fields
}

// After user expands:
{
    id: "task-1",
    name: "Parent Task",
    subTasks: [           // ← Now loaded!
        { id: "sub-1", name: "Subtask 1" },
        { id: "sub-2", name: "Subtask 2" }
    ],
    subTasksHasMore: false,
    subTasksPage: 1
}
```

## Caching Strategy

### First Expand
```
User expands Task 1
    ↓
Check: task.subTasks === undefined
    ↓
Fetch from server
    ↓
Store in state: task.subTasks = [...]
```

### Subsequent Expands
```
User expands Task 1 again
    ↓
Check: task.subTasks !== undefined
    ↓
Use cached data (NO FETCH)
    ↓
Display immediately
```

## Summary

✅ **ON-DEMAND LOADING IS WORKING CORRECTLY**

The current implementation:
1. ✅ Fetches subtasks ONLY when user expands a task
2. ✅ Fetches ONLY if subtasks haven't been loaded yet
3. ✅ Caches loaded subtasks in state
4. ✅ Reuses cached data on subsequent expands
5. ✅ No unnecessary database queries
6. ✅ Minimal data transfer
7. ✅ Fast initial page load

**Result: Optimal performance with lazy loading! 🚀**
