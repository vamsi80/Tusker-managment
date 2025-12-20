# QUICK REFERENCE: READ OPTIMIZATION

## 🎯 THE GOLDEN RULES

### 1. WORKSPACE-FIRST QUERIES
```typescript
✅ GOOD: Single workspace-level query
const tasks = await prisma.task.findMany({
  where: {
    project: { workspaceId: workspaceId }
  }
});

❌ BAD: Loop over projects
for (const project of projects) {
  await fetch(`/api/projects/${project.id}/tasks`);
}
```

### 2. ONE API PER SCREEN
```
Screen              | Main API                    | Additional APIs (on click)
--------------------|-----------------------------|--------------------------
Workspace Dashboard | GET /workspaces/{id}        | None
Project List        | GET /workspaces/{id}/projects | None
Kanban Board        | GET /projects/{id}/kanban   | Load more per column
Task List           | GET /projects/{id}/tasks    | GET /tasks/{id}/subtasks
Gantt Chart         | GET /projects/{id}/gantt    | None
Task Details        | None (modal)                | GET /tasks/{id}
```

### 3. CACHE DURATIONS
```typescript
Workspace info:     revalidate: 60 * 60 * 24  // 24 hours
Project info:       revalidate: 60 * 60       // 1 hour
Task lists:         revalidate: 60             // 1 minute
Task details:       revalidate: 30             // 30 seconds
Comments:           revalidate: 10             // 10 seconds
```

### 4. REQUIRED INDEXES
```prisma
model Task {
  @@index([projectId])
  @@index([parentTaskId])
  @@index([projectId, parentTaskId])
  @@index([projectId, status])
  @@index([status, createdAt])
  @@index([createdAt])
}

model Project {
  @@index([workspaceId])
  @@index([workspaceId, createdAt])
}

model WorkspaceMember {
  @@index([workspaceId])
  @@index([userId])
  @@index([workspaceId, userId])
}

model TaskAssignee {
  @@index([taskId])
  @@index([workspaceMemberId])
}
```

### 5. SELECT ONLY WHAT YOU NEED
```typescript
// ✅ List View (minimal)
select: {
  id: true,
  name: true,
  status: true,
  assignee: {
    select: {
      workspaceMember: {
        select: {
          user: {
            select: { id: true, name: true, image: true }
          }
        }
      }
    }
  },
  _count: { select: { subTasks: true } }
}

// ✅ Detail View (complete)
select: {
  id: true,
  name: true,
  description: true,
  status: true,
  startDate: true,
  days: true,
  tag: true,
  assignee: { /* full user info */ },
  comments: { take: 10, orderBy: { createdAt: 'desc' } },
  attachments: true
}
```

## 📊 PERFORMANCE TARGETS

```
Metric                  | Target    | Current | Status
------------------------|-----------|---------|--------
Page Load Time          | < 1s      | ?       | Measure
API Response Time       | < 200ms   | ?       | Measure
Cache Hit Rate          | > 90%     | ?       | Measure
Database Query Time     | < 100ms   | ?       | Measure
Time to Interactive     | < 2s      | ?       | Measure
```

## 🚀 QUICK WINS CHECKLIST

- [ ] **Add indexes** (5 min)
  ```bash
  # Add to schema.prisma, then:
  npx prisma migrate dev --name add_performance_indexes
  ```

- [ ] **Increase cache duration** (2 min)
  ```typescript
  // In get-workspace-by-id.ts
  revalidate: 60 * 60 * 24  // Change from 60 to 86400
  ```

- [ ] **Add pagination to Kanban** (30 min)
  ```typescript
  // In get-all-subtasks.ts
  take: 20,  // Add this line
  ```

- [ ] **Remove unused fields** (15 min)
  ```typescript
  // Audit all select clauses
  // Remove fields not displayed in UI
  ```

## 🔍 DEBUGGING SLOW QUERIES

### 1. Enable Query Logging
```typescript
// lib/db.ts
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' },
  ],
});

prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Duration: ' + e.duration + 'ms');
});
```

### 2. Identify Slow Queries
```bash
# Look for queries taking > 100ms
# Common culprits:
# - Missing indexes
# - SELECT *
# - N+1 queries
# - No pagination
```

### 3. Fix Common Issues
```typescript
// ❌ Missing index
where: { projectId: 'abc' }  // Slow without index

// ✅ Add index
@@index([projectId])

// ❌ N+1 query
for (const task of tasks) {
  const user = await prisma.user.findUnique({ where: { id: task.userId } });
}

// ✅ Include relation
const tasks = await prisma.task.findMany({
  include: { user: true }
});

// ❌ No pagination
const tasks = await prisma.task.findMany();  // Could be 10,000 rows!

// ✅ Paginate
const tasks = await prisma.task.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize
});
```

## 📈 MONITORING

### Add Performance Tracking
```typescript
// lib/monitoring.ts
export function measureQueryTime(queryName: string) {
  const start = Date.now();
  
  return () => {
    const duration = Date.now() - start;
    
    if (duration > 100) {
      console.warn(`[SLOW QUERY] ${queryName}: ${duration}ms`);
    } else {
      console.log(`[QUERY] ${queryName}: ${duration}ms`);
    }
  };
}

// Usage:
export async function getWorkspaceTasks(workspaceId: string) {
  const endMeasure = measureQueryTime('getWorkspaceTasks');
  
  const tasks = await prisma.task.findMany({ ... });
  
  endMeasure();
  
  return tasks;
}
```

### Track Cache Hit Rate
```typescript
// lib/cache-metrics.ts
let cacheHits = 0;
let cacheMisses = 0;

export function recordCacheHit() {
  cacheHits++;
}

export function recordCacheMiss() {
  cacheMisses++;
}

export function getCacheStats() {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? (cacheHits / total) * 100 : 0;
  
  return {
    hits: cacheHits,
    misses: cacheMisses,
    total: total,
    hitRate: hitRate.toFixed(2) + '%'
  };
}

// View stats:
console.log(getCacheStats());
// { hits: 950, misses: 50, total: 1000, hitRate: '95.00%' }
```

## 🎯 CURRENT IMPLEMENTATION ANALYSIS

### ✅ What You're Already Doing Right

1. **Workspace-level queries** ✅
   - `get-workspace-tasks.ts` correctly queries at workspace level
   - Filters projects by workspace first

2. **React cache wrapper** ✅
   - Using `cache()` for request deduplication
   - Using `unstable_cache()` for data caching

3. **Pagination** ✅
   - Task lists are paginated
   - Subtasks lazy-loaded on expand

4. **Role-based filtering** ✅
   - Members see only their tasks
   - Admins see all tasks

5. **Selective field loading** ✅
   - Using `select` instead of fetching all fields
   - Using `_count` for subtask counts

### 🔧 What Needs Improvement

1. **Missing indexes** ⚠️
   - Add composite indexes for common queries
   - Index all foreign keys

2. **Kanban pagination** ⚠️
   - Currently loads all subtasks
   - Should paginate per status column

3. **Cache durations** ⚠️
   - Some caches might be too short (60s for everything)
   - Differentiate based on data volatility

4. **Performance monitoring** ⚠️
   - No query time tracking
   - No cache hit rate monitoring

5. **Virtual scrolling** ⚠️
   - Not implemented for large lists
   - Could improve performance with 100+ items

## 📝 NEXT STEPS

### Week 1: Database Optimization
1. Add indexes to Prisma schema
2. Run migration
3. Enable query logging
4. Identify slow queries

### Week 2: Caching Improvements
1. Adjust cache durations
2. Add cache hit rate monitoring
3. Implement Redis cache (optional)

### Week 3: API Optimization
1. Add Kanban pagination
2. Optimize Gantt query
3. Create workspace dashboard API

### Week 4: Frontend Optimization
1. Add virtual scrolling
2. Implement optimistic updates
3. Add prefetching

### Week 5: Monitoring & Testing
1. Load test with 10,000 tasks
2. Monitor cache hit rates
3. Set performance budgets
4. Document results

---

**Remember:** The goal is to serve 90% of requests from cache, not database!
