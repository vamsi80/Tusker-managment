# Admin Check Caching - Detailed Explanation

## 🎯 The Problem

Before caching, every time you called `requireAdmin()` to check if a user is an admin:

```typescript
// In your action
await requireAdmin(workspaceId); // DB query
// ... some code ...
await requireAdmin(workspaceId); // DB query AGAIN!
// ... more code ...
await requireAdmin(workspaceId); // DB query AGAIN!
```

**Result**: 3 database queries for the same check! This is slow and wasteful.

---

## ✅ The Solution

Now with caching:

```typescript
// In your action
await requireAdmin(workspaceId); // DB query (first time)
// ... some code ...
await requireAdmin(workspaceId); // Instant! (from cache)
// ... more code ...
await requireAdmin(workspaceId); // Instant! (from cache)
```

**Result**: Only 1 database query, rest from cache!

---

## 🏗️ How It Works

### Layer 1: React Cache (Same Render)
```typescript
export const requireAdmin = cache(async (workspaceId: string) => {
  // This ensures if you call requireAdmin() 10 times in one page render,
  // it only executes once
});
```

### Layer 2: Next.js Cache (Across Requests)
```typescript
const getCachedAdminCheck = (userId: string, workspaceId: string) =>
  unstable_cache(
    async () => _checkAdminInternal(userId, workspaceId),
    [`admin-check-${userId}-${workspaceId}`],
    {
      tags: [`admin-check-${userId}`, `workspace-admin-${workspaceId}`],
      revalidate: 60 * 60 * 24, // 24 hours
    }
  )();
```

This caches the admin check result for 24 hours across all requests.

---

## 📊 Real-World Example

### Scenario: Creating a Project

```typescript
export async function createProject(values: ProjectSchemaType) {
  // Check 1: Verify admin
  await requireAdmin(values.workspaceId); // DB query
  
  // Validate data
  const validation = projectSchema.safeParse(values);
  
  // Check 2: Double-check admin (defensive programming)
  await requireAdmin(values.workspaceId); // Instant! (cached)
  
  // Create project
  await prisma.project.create({ ... });
  
  // Check 3: Verify admin again before cleanup
  await requireAdmin(values.workspaceId); // Instant! (cached)
  
  return { status: "success" };
}
```

**Without caching**: 3 DB queries  
**With caching**: 1 DB query + 2 instant cache hits

---

## 🔄 Cache Invalidation

### When to Invalidate

You should invalidate the admin check cache when:

1. **User's role changes** (member → admin or admin → member)
2. **User is removed from workspace**
3. **User is added to workspace**

### How to Invalidate

```typescript
import { invalidateAdminCheck, invalidateWorkspaceAdminChecks } from "@/app/data/user/invalidate-project-cache";

// When a specific user's role changes
await invalidateAdminCheck(userId);

// When any admin role changes in a workspace
await invalidateWorkspaceAdminChecks(workspaceId);
```

---

## 💡 Best Practices

### ✅ DO:
```typescript
// Call requireAdmin() freely - it's cached!
await requireAdmin(workspaceId);
await requireAdmin(workspaceId);
await requireAdmin(workspaceId);
// Only 1 DB query total
```

### ❌ DON'T:
```typescript
// Don't try to cache the result yourself
const isAdmin = await requireAdmin(workspaceId);
// ... later ...
// Just call it again, it's already cached!
await requireAdmin(workspaceId);
```

---

## 🎓 Key Benefits

1. **Performance**: Admin checks are instant after first call
2. **Simplicity**: No need to pass admin status around
3. **Safety**: Can call multiple times without performance penalty
4. **Consistency**: Always gets fresh data when cache expires

---

## 📈 Performance Comparison

### Before Caching:
```
Action with 5 admin checks:
- Check 1: 50ms (DB query)
- Check 2: 50ms (DB query)
- Check 3: 50ms (DB query)
- Check 4: 50ms (DB query)
- Check 5: 50ms (DB query)
Total: 250ms
```

### After Caching:
```
Action with 5 admin checks:
- Check 1: 50ms (DB query)
- Check 2: <1ms (cache)
- Check 3: <1ms (cache)
- Check 4: <1ms (cache)
- Check 5: <1ms (cache)
Total: ~54ms (4.6x faster!)
```

---

## 🔍 How to Use in Your Code

### Example 1: Project Creation
```typescript
export async function createProject(values: ProjectSchemaType) {
  // Just call it - it's cached!
  await requireAdmin(values.workspaceId);
  
  // Your logic here...
}
```

### Example 2: User Invitation
```typescript
export async function inviteUser(values: InviteUserSchemaType) {
  // Just call it - it's cached!
  await requireAdmin(values.workspaceId);
  
  // Your logic here...
}
```

### Example 3: Any Admin Action
```typescript
export async function anyAdminAction(workspaceId: string) {
  // Just call it - it's cached!
  const { sessionUser, workspace } = await requireAdmin(workspaceId);
  
  // Now you have both the user and workspace info
  console.log(sessionUser.id);
  console.log(workspace.workspaceId);
}
```

---

## 🎯 Summary

**Before**: Every `requireAdmin()` call = database query  
**After**: First `requireAdmin()` call = database query, rest = instant cache hits  

**Cache Duration**: 24 hours  
**Invalidation**: Manual (when roles change) or automatic (after 24 hours)  

**Bottom Line**: Call `requireAdmin()` as many times as you want - it's free! 🚀
