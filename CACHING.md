# Caching Implementation

## Overview
Implemented a multi-layer caching strategy for user projects, workspaces, and admin checks to significantly improve page load performance.

## Caching Layers

### 1. React Cache (Request Deduplication)
- Uses `cache()` from React
- Deduplicates identical requests **within the same render**
- Prevents multiple database queries in a single page render

### 2. Next.js Data Cache (Persistent Cache)
- Uses `unstable_cache()` from Next.js
- Caches data **across requests** for 24 hours
- Tagged for targeted invalidation

## Cached Data

### User Projects
- **Function**: `getUserProjects(workspaceId)`
- **Tags**: 
  - `user-projects-{userId}`
  - `workspace-projects-{workspaceId}`
- **Revalidation**: 24 hours

### User Workspaces
- **Function**: `getUserWorkspaces(userId)`
- **Tags**: 
  - `user-workspaces-{userId}`
- **Revalidation**: 24 hours

### Admin Checks
- **Function**: `requireAdmin(workspaceId)`
- **Tags**: 
  - `admin-check-{userId}`
  - `workspace-admin-{workspaceId}`
- **Revalidation**: 24 hours
- **Purpose**: Caches admin role verification to avoid repeated permission checks

## Cache Invalidation

### Automatic Revalidation
- Cache automatically revalidates every **24 hours**

### Manual Invalidation
Use the helper functions in `invalidate-project-cache.ts`:

```typescript
// Invalidate user projects
invalidateUserProjects(userId);

// Invalidate workspace projects
invalidateWorkspaceProjects(workspaceId);

// Invalidate both
invalidateProjectCaches(userId, workspaceId);

// Invalidate user workspaces
invalidateUserWorkspaces(userId);

// Invalidate admin check for a user
invalidateAdminCheck(userId);

// Invalidate admin checks for entire workspace
invalidateWorkspaceAdminChecks(workspaceId);
```

### When Cache is Invalidated
- ✅ **Project creation** - invalidates workspace projects cache
- ✅ **User invitation** - invalidates new user's workspaces cache
- ✅ **Role changes** - should invalidate admin checks (TODO: implement)
- 🔄 **TODO**: Add to project update/delete actions

## Performance Benefits

1. **First Load**: Database query (slower)
2. **Subsequent Loads**: Cached data (instant)
3. **Multiple Components**: Single query per render (deduplicated)
4. **Fresh Data**: Auto-revalidates every 24 hours
5. **Permission Checks**: Admin checks are cached, so calling `requireAdmin()` multiple times is free

## Usage Examples

```typescript
// Get user projects (cached)
const projects = await getUserProjects(workspaceId);

// Get user workspaces (cached)
const workspaces = await getUserWorkspaces(userId);

// Check admin permission (cached)
await requireAdmin(workspaceId); // First call: DB query
await requireAdmin(workspaceId); // Second call: instant! (cached)
await requireAdmin(workspaceId); // Third call: instant! (cached)
```

## Files Modified

- `src/app/data/user/get-user-projects.ts` - User projects caching
- `src/app/data/workspace/get-user-workspace.ts` - User workspaces caching
- `src/app/data/workspace/requireAdmin.ts` - Admin permission caching
- `src/app/data/user/invalidate-project-cache.ts` - Cache invalidation utilities
- `src/app/w/[workspaceId]/action.ts` - Invalidate on project creation
- `src/app/w/[workspaceId]/team/actions.ts` - Invalidate on user invitation

