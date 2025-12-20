# 🔍 HOW TO CHECK & ADD DATABASE INDEXES

## Problem

Your Prisma schema has **NO indexes defined**, which is why queries are slow!

---

## ✅ SOLUTION: Add Indexes to Prisma Schema

### Step 1: Check Current Indexes

**Option 1: Using Neon Dashboard**
1. Go to https://console.neon.tech
2. Select your project
3. Click "SQL Editor"
4. Run this query:

```sql
SELECT 
    tablename,
    indexname,
    indexdef
FROM 
    pg_indexes
WHERE 
    schemaname = 'public'
    AND tablename IN ('Task', 'Project', 'ProjectMember', 'WorkspaceMember')
ORDER BY 
    tablename,
    indexname;
```

**Option 2: Using Prisma Studio**
```bash
npx prisma studio
```
(But this won't show indexes)

---

### Step 2: Add Indexes to Prisma Schema

Open `prisma/schema.prisma` and add indexes to your models:

#### Task Model:
```prisma
model Task {
  id            String   @id @default(cuid())
  name          String
  taskSlug      String
  description   String?
  status        TaskStatus @default(TO_DO)
  priority      TaskPriority @default(MEDIUM)
  position      Int      @default(0)
  projectId     String
  parentTaskId  String?
  assigneeId    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // ... other fields ...
  
  // ✅ ADD THESE INDEXES:
  @@index([projectId])
  @@index([parentTaskId])
  @@index([status])
  @@index([assigneeId])
  @@index([position])
  @@index([createdAt])
  @@index([projectId, status])
  @@index([projectId, parentTaskId])
  @@index([projectId, status, position])
}
```

#### ProjectMember Model:
```prisma
model ProjectMember {
  id                  String   @id @default(cuid())
  projectId           String
  workspaceMemberId   String
  projectRole         ProjectRole @default(MEMBER)
  createdAt           DateTime @default(now())
  
  // ... relations ...
  
  // ✅ ADD THESE INDEXES:
  @@index([projectId])
  @@index([workspaceMemberId])
  @@index([projectId, workspaceMemberId])
  @@unique([projectId, workspaceMemberId])
}
```

#### WorkspaceMember Model:
```prisma
model WorkspaceMember {
  id             String   @id @default(cuid())
  workspaceId    String
  userId         String
  workspaceRole  WorkspaceRole @default(MEMBER)
  createdAt      DateTime @default(now())
  
  // ... relations ...
  
  // ✅ ADD THESE INDEXES:
  @@index([workspaceId])
  @@index([userId])
  @@index([workspaceId, userId])
  @@unique([workspaceId, userId])
}
```

#### Project Model:
```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  slug        String
  workspaceId String
  createdAt   DateTime @default(now())
  
  // ... other fields ...
  
  // ✅ ADD THESE INDEXES:
  @@index([workspaceId])
  @@index([slug])
  @@index([workspaceId, slug])
  @@unique([workspaceId, slug])
}
```

---

### Step 3: Apply Indexes to Database

After adding indexes to your schema:

```bash
# Push schema changes to database
pnpm prisma db push
```

**Expected output:**
```
🚀  Your database is now in sync with your Prisma schema.
✔ Generated Prisma Client

The following indexes were created:
  - idx_task_projectId
  - idx_task_parentTaskId
  - idx_task_status
  ... (and more)
```

---

### Step 4: Verify Indexes Were Created

**Option 1: Check in Neon Dashboard**

Run this query in SQL Editor:
```sql
SELECT 
    tablename,
    indexname
FROM 
    pg_indexes
WHERE 
    schemaname = 'public'
    AND tablename = 'Task'
ORDER BY 
    indexname;
```

**Expected output:**
```
tablename | indexname
----------|------------------
Task      | Task_pkey
Task      | Task_projectId_idx
Task      | Task_parentTaskId_idx
Task      | Task_status_idx
Task      | Task_projectId_status_idx
...
```

**Option 2: Check Query Performance**

Before indexes:
```typescript
console.time('Query');
const tasks = await prisma.task.findMany({ where: { projectId } });
console.timeEnd('Query');
// Query: 2000ms ❌
```

After indexes:
```typescript
console.time('Query');
const tasks = await prisma.task.findMany({ where: { projectId } });
console.timeEnd('Query');
// Query: 50ms ✅
```

---

## 📊 Index Impact

### Without Indexes:
```
Query: SELECT * FROM Task WHERE projectId = '...'
Execution time: 2000-5000ms ❌
Rows scanned: ALL rows (10,000+)
```

### With Indexes:
```
Query: SELECT * FROM Task WHERE projectId = '...'
Execution time: 20-50ms ✅
Rows scanned: Only matching rows (100)
```

**Improvement: 40-100x faster!** 🚀

---

## 🎯 Quick Reference: Most Important Indexes

### Critical (Add First):
```prisma
// Task model
@@index([projectId])
@@index([parentTaskId])
@@index([status])
@@index([projectId, status])

// ProjectMember model
@@index([projectId])
@@index([workspaceMemberId])

// WorkspaceMember model
@@index([workspaceId])
@@index([userId])
```

### Important (Add Next):
```prisma
// Task model
@@index([assigneeId])
@@index([position])
@@index([createdAt])
@@index([projectId, parentTaskId])

// Project model
@@index([workspaceId])
@@index([slug])
```

---

## 🔍 How to Know If Indexes Are Working

### Method 1: EXPLAIN ANALYZE (PostgreSQL)

In Neon SQL Editor:
```sql
EXPLAIN ANALYZE 
SELECT * FROM "Task" 
WHERE "projectId" = 'your-project-id' 
AND "status" = 'TO_DO';
```

**Without index:**
```
Seq Scan on Task  (cost=0.00..1000.00 rows=100)
  Filter: (projectId = '...' AND status = 'TO_DO')
Execution Time: 2000.123 ms ❌
```

**With index:**
```
Index Scan using Task_projectId_status_idx on Task  (cost=0.29..8.31 rows=1)
  Index Cond: (projectId = '...' AND status = 'TO_DO')
Execution Time: 0.456 ms ✅
```

Look for:
- ✅ "Index Scan" = Good! Using index
- ❌ "Seq Scan" = Bad! Not using index

---

### Method 2: Check Network Tab

**Before indexes:**
```
GET /api/.../kanban/load-more
Waiting for server: 7.78s ❌
```

**After indexes:**
```
GET /api/.../kanban/load-more
Waiting for server: 50-100ms ✅
```

---

### Method 3: Console Logging

Add to your data functions:
```typescript
export const getSubTasksByStatus = async (...) => {
  console.time('🔍 Database Query');
  
  const result = await prisma.task.findMany({ ... });
  
  console.timeEnd('🔍 Database Query');
  // Should show: 🔍 Database Query: 50ms ✅
  
  return result;
};
```

---

## 🚨 Common Issues

### Issue 1: "Database is already in sync"

**Problem:** Prisma doesn't see any changes

**Solution:** You forgot to add `@@index` to your schema

**Fix:**
1. Open `prisma/schema.prisma`
2. Add `@@index([fieldName])` to models
3. Run `pnpm prisma db push` again

---

### Issue 2: Indexes not improving performance

**Problem:** Wrong indexes or missing composite indexes

**Solution:** Check which queries are slow

**Fix:**
```sql
-- Find slow queries in Neon
SELECT 
    query,
    mean_exec_time,
    calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

Then add indexes for those queries.

---

### Issue 3: Too many indexes

**Problem:** Every field has an index (slows down writes)

**Solution:** Only index fields used in WHERE, JOIN, ORDER BY

**Rule of thumb:**
- ✅ Index foreign keys (projectId, userId, etc.)
- ✅ Index frequently filtered fields (status, createdAt)
- ✅ Index composite queries (projectId + status)
- ❌ Don't index rarely used fields
- ❌ Don't index fields that change frequently

---

## 📝 Summary

### To Check Indexes:

**Option 1: Neon Dashboard SQL Editor**
```sql
SELECT tablename, indexname FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'Task';
```

**Option 2: Check Query Performance**
```typescript
console.time('Query');
await prisma.task.findMany({ where: { projectId } });
console.timeEnd('Query');
// Should be < 100ms with indexes
```

**Option 3: Network Tab**
- Waiting for server should be < 100ms

---

### To Add Indexes:

1. Open `prisma/schema.prisma`
2. Add `@@index([fieldName])` to models
3. Run `pnpm prisma db push`
4. Verify with SQL query or performance test

---

**Status:** Ready to add indexes!

Add the indexes to your schema and run `pnpm prisma db push` again! 🚀
