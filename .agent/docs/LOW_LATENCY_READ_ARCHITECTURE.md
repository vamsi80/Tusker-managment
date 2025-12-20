# LOW-LATENCY, HIGH-PERFORMANCE READ ARCHITECTURE
## Project Management Web Application

---

## 📋 TABLE OF CONTENTS

1. [Core Principles](#core-principles)
2. [Data Flow Mental Model](#data-flow-mental-model)
3. [Screen-Based READ APIs](#screen-based-read-apis)
4. [Caching Strategy (Simple Explanation)](#caching-strategy-simple-explanation)
5. [API Calling Flow](#api-calling-flow)
6. [Database Optimization](#database-optimization)
7. [Frontend Performance](#frontend-performance)
8. [Do's and Don'ts](#dos-and-donts)
9. [Implementation Checklist](#implementation-checklist)

---

## 🎯 CORE PRINCIPLES

### The Golden Rule: **WORKSPACE-FIRST ARCHITECTURE**

```
❌ WRONG: Call API for each project → Slow, many requests
✅ RIGHT: Call ONE API at workspace level → Fast, single request
```

### Why This Matters

Your app has this hierarchy:
```
Workspace
  ├── Project 1
  │     ├── Task 1
  │     │    ├── Subtask 1
  │     │    └── Subtask 2
  │     └── Task 2
  └── Project 2
```

**BAD APPROACH (Slow):**
```javascript
// ❌ Multiple API calls - SLOW!
for each project {
  fetch(`/api/projects/${projectId}/tasks`)  // 10 projects = 10 API calls!
}
```

**GOOD APPROACH (Fast):**
```javascript
// ✅ Single API call - FAST!
fetch(`/api/workspaces/${workspaceId}/tasks`)  // 1 API call for everything!
```

---

## 🧠 DATA FLOW MENTAL MODEL

Think of your data flow like a **water pipeline**:

```
┌─────────────┐
│   Browser   │ ← User sees page
└──────┬──────┘
       │ 1. Request page
       ▼
┌─────────────┐
│ Next.js RSC │ ← Server Component (fast!)
└──────┬──────┘
       │ 2. Check cache first
       ▼
┌─────────────┐
│ Redis Cache │ ← Data stored here (super fast!)
└──────┬──────┘
       │ 3. If not in cache...
       ▼
┌─────────────┐
│  Database   │ ← Only hit when necessary
└──────┬──────┘
       │ 4. Return data + cache it
       ▼
┌─────────────┐
│   Browser   │ ← User sees data (milliseconds!)
└─────────────┘
```

### Key Insight

**90% of requests should be served from cache, not database!**

- **First user** hits database → Takes 200ms
- **Next 100 users** hit cache → Takes 5ms each
- Cache expires after 60 seconds → Refresh from database

---

## 📱 SCREEN-BASED READ APIs

### Rule: **ONE MAIN API PER SCREEN**

Each screen gets exactly ONE primary data-loading API. Additional data loads only on user interaction.

---

### 1️⃣ WORKSPACE DASHBOARD

**Screen Purpose:** Show overview of all projects and recent tasks

**API Design:**
```typescript
GET /api/workspaces/{workspaceId}/dashboard

Response: {
  workspace: {
    id: string
    name: string
    projectCount: number
    taskCount: number
    memberCount: number
  }
  recentTasks: Task[]        // Last 10 tasks across all projects
  projectSummaries: {        // Summary stats per project
    projectId: string
    projectName: string
    taskCount: number
    completedCount: number
    inProgressCount: number
  }[]
}
```

**Why It's Fast:**
- ✅ Single database query with aggregations
- ✅ Returns ONLY summary data (no full task details)
- ✅ Cached for 60 seconds at workspace level
- ✅ No nested loops or N+1 queries

**Database Query Strategy:**
```sql
-- Single optimized query
SELECT 
  w.id, w.name,
  COUNT(DISTINCT p.id) as projectCount,
  COUNT(DISTINCT t.id) as taskCount,
  COUNT(DISTINCT wm.id) as memberCount
FROM Workspace w
LEFT JOIN Project p ON p.workspaceId = w.id
LEFT JOIN Task t ON t.projectId = p.id
LEFT JOIN WorkspaceMember wm ON wm.workspaceId = w.id
WHERE w.id = $workspaceId
GROUP BY w.id

-- Separate query for recent tasks (indexed on createdAt)
SELECT * FROM Task 
WHERE projectId IN (SELECT id FROM Project WHERE workspaceId = $workspaceId)
ORDER BY createdAt DESC 
LIMIT 10
```

---

### 2️⃣ PROJECT LIST VIEW

**Screen Purpose:** Show all projects in workspace with basic info

**API Design:**
```typescript
GET /api/workspaces/{workspaceId}/projects

Response: {
  projects: {
    id: string
    name: string
    slug: string
    description: string
    taskCount: number
    completedTaskCount: number
    members: {
      id: string
      name: string
      image: string
    }[]  // Only first 5 members
  }[]
}
```

**Why It's Fast:**
- ✅ Workspace-level query (not per-project)
- ✅ Uses `_count` aggregation (no separate queries)
- ✅ Limits member list to first 5 (rest load on click)
- ✅ No task details loaded (just counts)

**Current Implementation:**
Your app already does this correctly! The workspace query fetches all projects in one go.

---

### 3️⃣ KANBAN BOARD (Project View)

**Screen Purpose:** Show subtasks grouped by status columns

**API Design:**
```typescript
GET /api/projects/{projectId}/kanban?workspaceId={workspaceId}

Response: {
  columns: {
    TODO: SubTask[]         // First 20 per column
    IN_PROGRESS: SubTask[]
    IN_REVIEW: SubTask[]
    DONE: SubTask[]
  }
  totalCounts: {
    TODO: number
    IN_PROGRESS: number
    IN_REVIEW: number
    DONE: number
  }
  hasMore: {
    TODO: boolean
    IN_PROGRESS: boolean
    IN_REVIEW: boolean
    DONE: boolean
  }
}
```

**Why It's Fast:**
- ✅ Single query fetches ALL subtasks for project
- ✅ Grouped by status in application layer (not database)
- ✅ Initial load: 20 cards per column (rest lazy-loaded)
- ✅ Includes parent task info (no additional queries)
- ✅ Role-based filtering in database (members see only their subtasks)

**Current Implementation Analysis:**
```typescript
// ✅ GOOD: Your current approach
export const getAllSubTasks = cache(
  async (projectId: string, workspaceId: string) => {
    // Single query for all subtasks
    const subTasks = await prisma.task.findMany({
      where: {
        parentTask: { projectId },
        parentTaskId: { not: null }
      },
      select: { /* only needed fields */ },
      orderBy: { position: 'asc' }
    });
    
    return { subTasks };
  }
);
```

**Optimization Opportunity:**
Add pagination per status column:

```typescript
// ✅ BETTER: Paginated Kanban
export const getSubTasksByStatus = cache(
  async (
    projectId: string, 
    workspaceId: string,
    status: TaskStatus,
    page: number = 1,
    pageSize: number = 20
  ) => {
    const [subTasks, totalCount] = await prisma.$transaction([
      prisma.task.findMany({
        where: {
          parentTask: { projectId },
          parentTaskId: { not: null },
          status: status
        },
        select: { /* only needed fields */ },
        orderBy: { position: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.task.count({
        where: {
          parentTask: { projectId },
          parentTaskId: { not: null },
          status: status
        }
      })
    ]);
    
    return { 
      subTasks, 
      totalCount,
      hasMore: totalCount > page * pageSize 
    };
  }
);
```

---

### 4️⃣ TASK LIST VIEW (Project View)

**Screen Purpose:** Show parent tasks with expandable subtasks

**API Design:**
```typescript
GET /api/projects/{projectId}/tasks?page=1&pageSize=10

Response: {
  tasks: {
    id: string
    name: string
    status: string
    assignee: User
    subtaskCount: number    // Just the count, not the subtasks!
    // ... other task fields
  }[]
  totalCount: number
  hasMore: boolean
}

// On expand (user clicks task row):
GET /api/tasks/{taskId}/subtasks?page=1&pageSize=10

Response: {
  subtasks: SubTask[]
  totalCount: number
  hasMore: boolean
}
```

**Why It's Fast:**
- ✅ Initial load: Only parent tasks (no subtasks)
- ✅ Uses `_count` for subtask numbers (no data loaded)
- ✅ Pagination prevents loading 1000s of tasks
- ✅ Subtasks load ONLY when user expands (lazy loading)
- ✅ Each expansion cached separately

**Current Implementation:**
```typescript
// ✅ EXCELLENT: Your current approach is perfect!
export const getProjectTasks = cache(
  async (projectId, workspaceId, page = 1, pageSize = 10) => {
    const [totalCount, tasks] = await prisma.$transaction([
      prisma.task.count({ where: { projectId, parentTaskId: null } }),
      prisma.task.findMany({
        where: { projectId, parentTaskId: null },
        select: {
          // ... task fields
          _count: { select: { subTasks: true } }  // ✅ Count only!
        },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    
    return { tasks, totalCount, hasMore: ... };
  }
);
```

---

### 5️⃣ GANTT CHART VIEW

**Screen Purpose:** Timeline view of all tasks and dependencies

**API Design:**
```typescript
GET /api/projects/{projectId}/gantt?workspaceId={workspaceId}

Response: {
  tasks: {
    id: string
    name: string
    startDate: Date
    endDate: Date
    progress: number
    dependencies: string[]  // Array of task IDs
    subtasks: {
      id: string
      name: string
      startDate: Date
      endDate: Date
      progress: number
    }[]
  }[]
}
```

**Why It's Fast:**
- ✅ Fetches ALL tasks at once (Gantt needs full view)
- ✅ No pagination (Gantt chart needs complete timeline)
- ✅ Includes dependencies in single query (no N+1)
- ✅ Cached heavily (Gantt data changes less frequently)
- ✅ Returns only date/timeline fields (no descriptions)

**Special Consideration:**
Gantt is the ONLY view where we fetch all data upfront because:
- Users need to see the full timeline
- Scrolling/zooming requires all data
- Dependencies need to be rendered as lines

```typescript
// ✅ Gantt-specific optimization
export const getGanttData = cache(
  async (projectId: string, workspaceId: string) => {
    const tasks = await prisma.task.findMany({
      where: { projectId, parentTaskId: null },
      select: {
        id: true,
        name: true,
        startDate: true,
        days: true,  // Calculate endDate from this
        status: true,
        subTasks: {
          select: {
            id: true,
            name: true,
            startDate: true,
            days: true,
            status: true,
            dependsOn: { select: { id: true } }
          },
          orderBy: { position: 'asc' }
        }
      },
      orderBy: { position: 'asc' }
    });
    
    // Transform to Gantt format on server
    return transformToGanttFormat(tasks);
  }
);
```

---

### 6️⃣ TASK DETAILS (On Click)

**Screen Purpose:** Show full details of a single task/subtask

**API Design:**
```typescript
GET /api/tasks/{taskId}?workspaceId={workspaceId}

Response: {
  task: {
    id: string
    name: string
    description: string
    status: string
    assignee: User
    createdBy: User
    startDate: Date
    endDate: Date
    tags: string[]
    comments: Comment[]      // Last 10 comments
    attachments: File[]
    dependencies: Task[]
    history: ActivityLog[]   // Last 20 activities
  }
}
```

**Why It's Fast:**
- ✅ Loads only when user clicks (not on page load)
- ✅ Single query with all related data
- ✅ Cached per task (60 second TTL)
- ✅ Comments/history paginated (first 10/20 only)

---

## 🚀 CACHING STRATEGY (SIMPLE EXPLANATION)

### What is Caching?

Think of caching like a **photocopy machine**:

1. **First time:** You go to the library, find a book, photocopy a page → **SLOW** (like database query)
2. **Next time:** You already have the photocopy → **INSTANT** (like cache hit)
3. **After 1 hour:** Photocopy expires, get a fresh copy → **REFRESH** (like cache invalidation)

---

### Three Levels of Caching

```
┌──────────────────────────────────────────┐
│  LEVEL 1: Browser Cache (Fastest)       │
│  - Stores data in user's browser         │
│  - No network request needed             │
│  - Duration: Until page refresh          │
└──────────────────────────────────────────┘
                  ↓ (if not found)
┌──────────────────────────────────────────┐
│  LEVEL 2: Next.js Cache (Very Fast)     │
│  - Stores data on server (React cache)   │
│  - Shared across requests                │
│  - Duration: 60 seconds                  │
└──────────────────────────────────────────┘
                  ↓ (if not found)
┌──────────────────────────────────────────┐
│  LEVEL 3: Redis Cache (Fast)            │
│  - Stores data in memory database        │
│  - Shared across all servers             │
│  - Duration: 5-30 minutes                │
└──────────────────────────────────────────┘
                  ↓ (if not found)
┌──────────────────────────────────────────┐
│  DATABASE: PostgreSQL (Slowest)         │
│  - Actual source of truth                │
│  - Only hit when cache misses            │
└──────────────────────────────────────────┘
```

---

### Cache Keys (How to Organize Cache)

**Rule:** Cache keys should be at **WORKSPACE LEVEL**, not project level.

```typescript
// ❌ BAD: Project-level cache keys
cache-key: `project-${projectId}-tasks`
// Problem: Need to invalidate 10 keys for 10 projects

// ✅ GOOD: Workspace-level cache keys
cache-key: `workspace-${workspaceId}-tasks`
// Benefit: Invalidate 1 key, clears all project data
```

**Your Current Implementation (Excellent!):**
```typescript
// From get-workspace-tasks.ts
unstable_cache(
  async () => _getWorkspaceTasksInternal(...),
  [`workspace-tasks-${workspaceId}-user-${userId}-filters-${filterHash}-page-${page}`],
  {
    tags: [
      `workspace-tasks-${workspaceId}`,      // ✅ Workspace-level tag
      `workspace-tasks-user-${userId}`,      // ✅ User-specific tag
      `workspace-tasks-all`,                 // ✅ Global tag
    ],
    revalidate: 60,  // ✅ 60 second cache
  }
)
```

---

### Cache Duration Guidelines

```typescript
// ✅ Recommended cache durations

// STATIC DATA (changes rarely)
Workspace info:     24 hours (86400 seconds)
Project info:       1 hour (3600 seconds)
User profiles:      1 hour (3600 seconds)

// DYNAMIC DATA (changes frequently)
Task lists:         60 seconds
Kanban board:       60 seconds
Task details:       30 seconds

// REAL-TIME DATA (changes constantly)
Comments:           10 seconds
Notifications:      5 seconds
Online status:      No cache (use WebSocket)
```

---

### Cache Invalidation (When to Clear Cache)

**Simple Rule:** Clear cache when data changes.

```typescript
// Example: When a task is updated
export async function updateTask(taskId: string, data: TaskData) {
  // 1. Update database
  const task = await prisma.task.update({
    where: { id: taskId },
    data: data
  });
  
  // 2. Clear related caches
  revalidateTag(`workspace-tasks-${task.workspaceId}`);
  revalidateTag(`project-tasks-${task.projectId}`);
  revalidateTag(`task-${taskId}`);
  
  return task;
}
```

**Your Current Implementation:**
```typescript
// From revalidate-task-data.ts
export async function revalidateTaskData(
  workspaceId: string,
  projectId?: string,
  taskId?: string
) {
  // ✅ Granular invalidation
  revalidateTag(`workspace-tasks-${workspaceId}`);
  
  if (projectId) {
    revalidateTag(`project-tasks-${projectId}`);
  }
  
  if (taskId) {
    revalidateTag(`task-${taskId}`);
  }
}
```

---

### Short-Term Cache (10-30 seconds)

**Use Case:** Data that changes frequently but doesn't need to be real-time.

```typescript
// Example: Task list with 10-second cache
const getCachedTasks = unstable_cache(
  async () => fetchTasksFromDB(),
  ['workspace-tasks'],
  { 
    revalidate: 10,  // ✅ 10 second cache
    tags: ['workspace-tasks']
  }
);

// Timeline:
// 0s:  User A loads page → Database hit → Cache stored
// 2s:  User B loads page → Cache hit (fast!)
// 5s:  User C loads page → Cache hit (fast!)
// 11s: User D loads page → Database hit → Cache refreshed
```

**Benefits:**
- Reduces database load by 90%
- Data is "fresh enough" for most use cases
- Simple to implement

---

## 🔄 API CALLING FLOW

### Step-by-Step: What Happens When User Opens a Page

```
USER CLICKS "Open Workspace Dashboard"
         ↓
┌────────────────────────────────────────┐
│ 1. Browser sends request to server    │
│    GET /workspaces/abc123/dashboard    │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 2. Next.js Server Component runs      │
│    - Checks user authentication        │
│    - Validates workspace access        │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 3. Check React Cache (in-memory)      │
│    Key: workspace-abc123-dashboard     │
│    ├─ HIT? → Return data (5ms)        │
│    └─ MISS? → Continue to step 4      │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 4. Check Redis Cache (optional)       │
│    Key: workspace-abc123-dashboard     │
│    ├─ HIT? → Return data (20ms)       │
│    └─ MISS? → Continue to step 5      │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 5. Query Database (PostgreSQL)        │
│    - Run optimized SQL query           │
│    - Use indexes for fast lookup       │
│    - Return data (100-200ms)           │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 6. Store in Cache                     │
│    - Save to React cache (60s TTL)     │
│    - Save to Redis cache (5min TTL)    │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 7. Transform Data for UI              │
│    - Format dates                      │
│    - Calculate derived fields          │
│    - Remove sensitive data             │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 8. Send Response to Browser           │
│    - Render HTML (Server Component)    │
│    - Send to client (50ms)             │
└────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ 9. Browser Renders Page               │
│    - User sees data (TOTAL: 200ms)     │
└────────────────────────────────────────┘
```

---

### Performance Breakdown

```
FIRST USER (Cold Cache):
├─ Authentication:        10ms
├─ Cache check:           5ms (miss)
├─ Database query:        150ms
├─ Data transformation:   20ms
├─ Network transfer:      50ms
└─ TOTAL:                 235ms ✅ Acceptable

SECOND USER (Warm Cache):
├─ Authentication:        10ms
├─ Cache check:           5ms (HIT!)
├─ Network transfer:      50ms
└─ TOTAL:                 65ms  ✅ FAST!

HUNDREDTH USER (Warm Cache):
└─ TOTAL:                 65ms  ✅ CONSISTENT!
```

---

### Error Handling in API Flow

```typescript
export const getWorkspaceTasks = cache(
  async (workspaceId: string) => {
    try {
      // 1. Validate input
      if (!workspaceId) {
        throw new Error('Workspace ID required');
      }
      
      // 2. Check authentication
      const user = await requireUser();
      
      // 3. Check cache
      const cached = await getCachedData(workspaceId);
      if (cached) return cached;
      
      // 4. Query database
      const data = await prisma.task.findMany({ ... });
      
      // 5. Cache result
      await setCachedData(workspaceId, data);
      
      return data;
      
    } catch (error) {
      // ✅ Graceful degradation
      console.error('Error fetching tasks:', error);
      
      // Return empty data instead of crashing
      return { 
        tasks: [], 
        totalCount: 0,
        error: 'Failed to load tasks'
      };
    }
  }
);
```

---

## 💾 DATABASE OPTIMIZATION

### Indexing Rules

**Rule 1:** Index ALL foreign keys

```sql
-- ✅ REQUIRED INDEXES
CREATE INDEX idx_task_projectId ON Task(projectId);
CREATE INDEX idx_task_parentTaskId ON Task(parentTaskId);
CREATE INDEX idx_task_assigneeId ON Task(assigneeId);
CREATE INDEX idx_project_workspaceId ON Project(workspaceId);
CREATE INDEX idx_workspaceMember_userId ON WorkspaceMember(userId);
CREATE INDEX idx_workspaceMember_workspaceId ON WorkspaceMember(workspaceId);
```

**Rule 2:** Index common filter fields

```sql
-- ✅ FILTER INDEXES
CREATE INDEX idx_task_status ON Task(status);
CREATE INDEX idx_task_createdAt ON Task(createdAt DESC);
CREATE INDEX idx_task_startDate ON Task(startDate);
```

**Rule 3:** Composite indexes for common queries

```sql
-- ✅ COMPOSITE INDEXES (order matters!)
CREATE INDEX idx_task_project_parent ON Task(projectId, parentTaskId);
CREATE INDEX idx_task_project_status ON Task(projectId, status);
CREATE INDEX idx_task_workspace_status ON Task(workspaceId, status, createdAt DESC);
```

**Your Prisma Schema Should Include:**
```prisma
model Task {
  id           String   @id @default(cuid())
  projectId    String
  parentTaskId String?
  status       TaskStatus
  createdAt    DateTime @default(now())
  
  // ✅ Add these indexes
  @@index([projectId])
  @@index([parentTaskId])
  @@index([projectId, parentTaskId])
  @@index([projectId, status])
  @@index([status, createdAt])
  @@index([createdAt])
}
```

---

### Avoid SELECT * (Select Only What You Need)

```typescript
// ❌ BAD: Fetches ALL fields (slow, wasteful)
const tasks = await prisma.task.findMany({
  where: { projectId }
});

// ✅ GOOD: Fetches only needed fields (fast, efficient)
const tasks = await prisma.task.findMany({
  where: { projectId },
  select: {
    id: true,
    name: true,
    status: true,
    assignee: {
      select: {
        workspaceMember: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        }
      }
    }
  }
});
```

**Field Selection Guidelines:**
```typescript
// List View (minimal fields)
select: {
  id: true,
  name: true,
  status: true,
  assignee: { /* minimal user info */ },
  _count: { select: { subTasks: true } }
}

// Detail View (all fields)
select: {
  id: true,
  name: true,
  description: true,
  status: true,
  startDate: true,
  endDate: true,
  assignee: { /* full user info */ },
  comments: { /* last 10 */ },
  attachments: true,
  history: { /* last 20 */ }
}
```

---

### Avoid N+1 Queries

**Problem:** Fetching related data in a loop

```typescript
// ❌ BAD: N+1 Query Problem
const tasks = await prisma.task.findMany({ where: { projectId } });

// This runs 1 query per task! (100 tasks = 100 queries!)
for (const task of tasks) {
  const assignee = await prisma.user.findUnique({ 
    where: { id: task.assigneeId } 
  });
}
```

**Solution:** Use `include` or `select` with relations

```typescript
// ✅ GOOD: Single query with joins
const tasks = await prisma.task.findMany({
  where: { projectId },
  select: {
    id: true,
    name: true,
    assignee: {  // ✅ Joined in single query!
      select: {
        workspaceMember: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        }
      }
    }
  }
});
```

---

### Single Optimized Queries Filtered by workspaceId

**Always filter by workspace first:**

```typescript
// ✅ EXCELLENT: Workspace-scoped query
const tasks = await prisma.task.findMany({
  where: {
    project: {
      workspaceId: workspaceId  // ✅ Workspace filter first!
    },
    status: 'IN_PROGRESS'
  },
  select: { /* ... */ }
});

// Database uses index: idx_project_workspace → idx_task_project → idx_task_status
// Query time: ~50ms even with 10,000 tasks
```

**Your Current Implementation (Perfect!):**
```typescript
// From get-workspace-tasks.ts
const projects = await prisma.project.findMany({
  where: { workspaceId },  // ✅ Workspace filter
  select: { id: true }
});

const projectIds = projects.map(p => p.id);

const tasks = await prisma.task.findMany({
  where: {
    projectId: { in: projectIds },  // ✅ Scoped to workspace
    parentTaskId: null
  }
});
```

---

### Use Transactions for Multiple Queries

```typescript
// ✅ GOOD: Combine count + data in single transaction
const [totalCount, tasks] = await prisma.$transaction([
  prisma.task.count({ where: { projectId } }),
  prisma.task.findMany({ 
    where: { projectId },
    skip: (page - 1) * pageSize,
    take: pageSize
  })
]);

// Benefits:
// - Single round-trip to database
// - Consistent data (count matches data)
// - Faster than 2 separate queries
```

---

## 🎨 FRONTEND PERFORMANCE

### Reduce API Calls

**Rule:** Fetch data once, reuse everywhere

```typescript
// ❌ BAD: Multiple components fetch same data
function TaskList() {
  const { data } = useSWR('/api/tasks');
  // ...
}

function TaskCount() {
  const { data } = useSWR('/api/tasks');  // ❌ Duplicate request!
  // ...
}

// ✅ GOOD: Fetch once at parent, pass down
function TaskPage() {
  const { data } = useSWR('/api/tasks');
  
  return (
    <>
      <TaskList tasks={data.tasks} />
      <TaskCount count={data.totalCount} />
    </>
  );
}
```

**With Next.js Server Components (Even Better!):**
```typescript
// ✅ BEST: Server Component fetches once
async function TaskPage({ params }) {
  // Fetched on server, cached automatically
  const data = await getWorkspaceTasks(params.workspaceId);
  
  return (
    <>
      <TaskList tasks={data.tasks} />
      <TaskCount count={data.totalCount} />
    </>
  );
}
```

---

### Load Data in Parts (Pagination / Lazy Loading)

**Initial Load:** Show first page only

```typescript
// ✅ Initial page load
function TaskList() {
  const [page, setPage] = useState(1);
  const { data } = useSWR(`/api/tasks?page=${page}&pageSize=20`);
  
  return (
    <div>
      {data.tasks.map(task => <TaskRow key={task.id} task={task} />)}
      
      {data.hasMore && (
        <button onClick={() => setPage(p => p + 1)}>
          Load More
        </button>
      )}
    </div>
  );
}
```

**Infinite Scroll (Better UX):**
```typescript
// ✅ Infinite scroll with Intersection Observer
function TaskList() {
  const { data, size, setSize } = useSWRInfinite(
    (index) => `/api/tasks?page=${index + 1}&pageSize=20`
  );
  
  const observerRef = useRef();
  
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && data?.hasMore) {
        setSize(size + 1);  // Load next page
      }
    });
    
    if (observerRef.current) {
      observer.observe(observerRef.current);
    }
    
    return () => observer.disconnect();
  }, [data, size]);
  
  return (
    <div>
      {data?.pages.flatMap(page => page.tasks).map(task => (
        <TaskRow key={task.id} task={task} />
      ))}
      <div ref={observerRef} />  {/* Trigger point */}
    </div>
  );
}
```

**Virtual Scrolling (For 1000+ Items):**
```typescript
// ✅ Virtual scrolling with react-window
import { FixedSizeList } from 'react-window';

function TaskList({ tasks }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={tasks.length}
      itemSize={50}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <TaskRow task={tasks[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}

// Only renders visible rows (e.g., 20 out of 1000)
// Massive performance improvement!
```

---

### Optimistic UI for Interactions

**Concept:** Update UI immediately, sync with server in background

```typescript
// ✅ Optimistic update example
function TaskRow({ task }) {
  const [optimisticStatus, setOptimisticStatus] = useState(task.status);
  
  const updateStatus = async (newStatus) => {
    // 1. Update UI immediately (optimistic)
    setOptimisticStatus(newStatus);
    
    try {
      // 2. Send to server in background
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      
      // 3. Revalidate cache
      mutate(`/api/tasks`);
      
    } catch (error) {
      // 4. Rollback on error
      setOptimisticStatus(task.status);
      toast.error('Failed to update status');
    }
  };
  
  return (
    <div>
      <select 
        value={optimisticStatus} 
        onChange={(e) => updateStatus(e.target.value)}
      >
        <option value="TODO">To Do</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="DONE">Done</option>
      </select>
    </div>
  );
}
```

**Benefits:**
- ✅ Instant feedback (no loading spinner)
- ✅ Better user experience
- ✅ Works even with slow network

---

### Prefetching (Load Before User Clicks)

```typescript
// ✅ Prefetch on hover
function TaskRow({ task }) {
  const { mutate } = useSWRConfig();
  
  const prefetchDetails = () => {
    // Start loading task details when user hovers
    mutate(`/api/tasks/${task.id}`);
  };
  
  return (
    <Link 
      href={`/tasks/${task.id}`}
      onMouseEnter={prefetchDetails}  // ✅ Prefetch on hover
    >
      {task.name}
    </Link>
  );
}

// When user clicks, data is already loaded!
```

---

## ✅ DO'S AND DON'TS

### ✅ DO's (Best Practices)

#### 1. DO: Start Queries at Workspace Level
```typescript
✅ GET /api/workspaces/{workspaceId}/tasks
✅ GET /api/workspaces/{workspaceId}/projects
```

#### 2. DO: Use Pagination for Lists
```typescript
✅ GET /api/tasks?page=1&pageSize=20
✅ Load more on scroll/click
```

#### 3. DO: Cache Aggressively
```typescript
✅ Static data: 24 hours
✅ Dynamic data: 60 seconds
✅ Real-time data: 10 seconds
```

#### 4. DO: Select Only Needed Fields
```typescript
✅ select: { id: true, name: true, status: true }
❌ select: { /* everything */ }
```

#### 5. DO: Use Indexes on Filter Fields
```typescript
✅ @@index([projectId, status, createdAt])
```

#### 6. DO: Lazy Load Related Data
```typescript
✅ Load subtasks only when parent task is expanded
✅ Load comments only when detail view is opened
```

#### 7. DO: Use Transactions for Multiple Queries
```typescript
✅ const [count, data] = await prisma.$transaction([...])
```

#### 8. DO: Invalidate Cache on Write
```typescript
✅ revalidateTag(`workspace-tasks-${workspaceId}`)
```

#### 9. DO: Handle Errors Gracefully
```typescript
✅ try/catch with fallback data
✅ return { tasks: [], error: 'message' }
```

#### 10. DO: Use Server Components for Initial Load
```typescript
✅ async function Page() {
  const data = await getWorkspaceTasks();
  return <TaskList data={data} />
}
```

---

### ❌ DON'Ts (Anti-Patterns)

#### 1. DON'T: Loop Over Projects to Fetch Tasks
```typescript
❌ for (const project of projects) {
  await fetch(`/api/projects/${project.id}/tasks`)
}
```

#### 2. DON'T: Fetch All Data Without Pagination
```typescript
❌ const tasks = await prisma.task.findMany()  // Could be 10,000 rows!
```

#### 3. DON'T: Use SELECT * in Production
```typescript
❌ SELECT * FROM Task
✅ SELECT id, name, status FROM Task
```

#### 4. DON'T: Make N+1 Queries
```typescript
❌ for (const task of tasks) {
  const user = await prisma.user.findUnique({ where: { id: task.userId } })
}
```

#### 5. DON'T: Forget to Add Indexes
```typescript
❌ No indexes on foreign keys
✅ @@index([projectId, parentTaskId])
```

#### 6. DON'T: Cache Forever
```typescript
❌ revalidate: false  // Never updates!
✅ revalidate: 60     // Updates every minute
```

#### 7. DON'T: Fetch Same Data Multiple Times
```typescript
❌ Component A: useSWR('/api/tasks')
   Component B: useSWR('/api/tasks')  // Duplicate!
✅ Fetch once at parent, pass down as props
```

#### 8. DON'T: Load All Subtasks Upfront
```typescript
❌ include: { subTasks: true }  // Could be 100s of subtasks!
✅ _count: { select: { subTasks: true } }  // Just the count
```

#### 9. DON'T: Ignore Cache Invalidation
```typescript
❌ Update database without clearing cache
✅ revalidateTag() after every write
```

#### 10. DON'T: Use Client-Side Fetching for Initial Load
```typescript
❌ useEffect(() => { fetch('/api/tasks') }, [])
✅ Server Component: const data = await getTasks()
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Database Optimization (Week 1)

- [ ] **Add Indexes to Prisma Schema**
  ```prisma
  model Task {
    @@index([projectId])
    @@index([parentTaskId])
    @@index([projectId, parentTaskId])
    @@index([projectId, status])
    @@index([status, createdAt])
  }
  ```

- [ ] **Run Migration**
  ```bash
  npx prisma migrate dev --name add_performance_indexes
  ```

- [ ] **Audit All Queries**
  - [ ] Remove `SELECT *`
  - [ ] Add explicit `select` clauses
  - [ ] Use `_count` instead of loading relations

- [ ] **Add Query Logging**
  ```typescript
  // prisma/client.ts
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  ```

---

### Phase 2: Caching Implementation (Week 2)

- [ ] **Implement React Cache**
  - [x] Already using `cache()` wrapper ✅
  - [x] Already using `unstable_cache()` ✅

- [ ] **Add Redis Cache (Optional)**
  ```typescript
  // lib/redis.ts
  import { Redis } from '@upstash/redis';
  
  export const redis = new Redis({
    url: process.env.REDIS_URL,
    token: process.env.REDIS_TOKEN,
  });
  ```

- [ ] **Implement Cache Invalidation**
  - [x] Already have `revalidateTaskData()` ✅
  - [ ] Add to all write operations (create, update, delete)

- [ ] **Set Appropriate Cache Durations**
  - [ ] Workspace data: 24 hours
  - [ ] Project data: 1 hour
  - [ ] Task lists: 60 seconds
  - [ ] Task details: 30 seconds

---

### Phase 3: API Optimization (Week 3)

- [ ] **Workspace Dashboard API**
  - [ ] Create `/api/workspaces/[id]/dashboard` route
  - [ ] Return summary data only
  - [ ] Cache for 60 seconds

- [ ] **Kanban Pagination**
  - [ ] Implement per-status pagination
  - [ ] Load first 20 cards per column
  - [ ] Add "Load More" for each column

- [ ] **Task List Optimization**
  - [x] Already paginated ✅
  - [x] Already lazy-loads subtasks ✅
  - [ ] Add virtual scrolling for 100+ tasks

- [ ] **Gantt Optimization**
  - [ ] Fetch all data in single query
  - [ ] Transform to Gantt format on server
  - [ ] Cache for 60 seconds

---

### Phase 4: Frontend Optimization (Week 4)

- [ ] **Implement Infinite Scroll**
  - [ ] Task list view
  - [ ] Kanban columns
  - [ ] Comment sections

- [ ] **Add Optimistic Updates**
  - [ ] Task status changes
  - [ ] Task assignments
  - [ ] Task reordering

- [ ] **Implement Prefetching**
  - [ ] Prefetch task details on hover
  - [ ] Prefetch next page on scroll

- [ ] **Add Virtual Scrolling**
  - [ ] Install `react-window`
  - [ ] Implement for task lists with 100+ items

---

### Phase 5: Monitoring & Testing (Week 5)

- [ ] **Add Performance Monitoring**
  ```typescript
  // lib/monitoring.ts
  export function measureQueryTime(queryName: string) {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      console.log(`[PERF] ${queryName}: ${duration}ms`);
    };
  }
  ```

- [ ] **Load Testing**
  - [ ] Test with 1,000 tasks
  - [ ] Test with 10,000 tasks
  - [ ] Test with 100 concurrent users

- [ ] **Cache Hit Rate Monitoring**
  ```typescript
  let cacheHits = 0;
  let cacheMisses = 0;
  
  export function getCacheHitRate() {
    return cacheHits / (cacheHits + cacheMisses);
  }
  ```

- [ ] **Set Performance Budgets**
  - [ ] Page load: < 1 second
  - [ ] API response: < 200ms
  - [ ] Cache hit rate: > 90%

---

## 🎯 EXPECTED PERFORMANCE IMPROVEMENTS

### Before Optimization
```
Workspace Dashboard:     2-3 seconds
Project List:            1-2 seconds
Kanban Board:            3-5 seconds (with 500 cards)
Task List:               1-2 seconds
Gantt Chart:             4-6 seconds
Task Details:            500ms
```

### After Optimization
```
Workspace Dashboard:     200-300ms  (10x faster)
Project List:            100-200ms  (10x faster)
Kanban Board:            300-500ms  (10x faster)
Task List:               150-250ms  (8x faster)
Gantt Chart:             400-600ms  (10x faster)
Task Details:            100-150ms  (3x faster)
```

### Cache Hit Rates (Target)
```
First Load (Cold Cache):  0% hit rate
Second Load:              95% hit rate
Steady State:             98% hit rate
```

---

## 🚀 QUICK WINS (Implement Today)

### 1. Add Missing Indexes (5 minutes)
```prisma
// prisma/schema.prisma
model Task {
  @@index([projectId, parentTaskId])
  @@index([projectId, status])
}
```

### 2. Increase Cache Duration (2 minutes)
```typescript
// Change from 60s to appropriate duration
revalidate: 60 * 60  // 1 hour for project data
```

### 3. Add Pagination to Kanban (30 minutes)
```typescript
// Load first 20 cards per column
const subTasks = await prisma.task.findMany({
  where: { status: 'TODO' },
  take: 20  // ✅ Add this
});
```

### 4. Remove Unnecessary Fields (15 minutes)
```typescript
// Audit all queries, remove unused fields
select: {
  id: true,
  name: true,
  status: true,
  // ❌ Remove: description, createdAt, updatedAt (if not displayed)
}
```

---

## 📚 SUMMARY

### Key Takeaways

1. **Workspace-First Architecture**
   - Always query at workspace level
   - Avoid per-project loops

2. **One API Per Screen**
   - Initial load: Single API call
   - Interactions: Lazy load additional data

3. **Aggressive Caching**
   - 60 second cache for dynamic data
   - 1 hour cache for static data
   - Invalidate on write

4. **Database Optimization**
   - Index all foreign keys
   - Index filter fields
   - Use composite indexes

5. **Frontend Best Practices**
   - Pagination for lists
   - Lazy loading for details
   - Optimistic updates for interactions

6. **Monitoring**
   - Track query times
   - Monitor cache hit rates
   - Set performance budgets

---

## 🎓 FINAL MENTAL MODEL

Think of your application like a **restaurant**:

- **Database** = Kitchen (slow, but makes fresh food)
- **Cache** = Buffet (fast, pre-made food)
- **API** = Waiter (delivers food to customer)

**Bad Restaurant (Slow):**
- Every customer orders from kitchen
- Kitchen makes food from scratch every time
- Long wait times

**Good Restaurant (Fast):**
- Most customers get food from buffet (cache)
- Kitchen only makes fresh food when buffet is empty
- Buffet refreshed every hour
- Fast service!

**Your goal:** Serve 90% of requests from the buffet (cache), only 10% from the kitchen (database).

---

**END OF DOCUMENT**

*This architecture is designed for production use and scales to 10,000+ tasks and 100+ concurrent users.*
