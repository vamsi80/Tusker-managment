# Workspace Context Usage Guide

## Overview
The workspace data is now fetched **once** in the layout and shared with all child pages via React Context. This eliminates redundant API calls and improves performance.

## What's Available

### In the Layout
The layout fetches:
- `workspace` - Full workspace data including members
- `workspaceId` - The workspace ID

Both are passed to `WorkspaceProvider` and available to all child components.

## How to Use in Pages

### Option 1: Use the Full Workspace Data (Client Components)

```tsx
"use client";

import { useWorkspace } from "@/contexts/workspace-context";

export function MyComponent() {
    const { workspace, workspaceId } = useWorkspace();
    
    // Access workspace properties
    console.log(workspace.name);
    console.log(workspace.ownerId);
    console.log(workspace.members); // Array of members
    
    return <div>{workspace.name}</div>;
}
```

### Option 2: Use Just the Workspace ID (Client Components)

```tsx
"use client";

import { useWorkspaceId } from "@/contexts/workspace-context";

export function MyComponent() {
    const workspaceId = useWorkspaceId();
    
    return <div>Workspace: {workspaceId}</div>;
}
```

### Option 3: Server Components (Pages)

Server components **cannot** use React Context. They should continue using `params`:

```tsx
// ❌ DON'T DO THIS in server components
export default async function MyPage() {
    const { workspace } = useWorkspace(); // ERROR!
}

// ✅ DO THIS instead
export default async function MyPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params;
    // ... fetch data you need
}
```

**However**, you can pass data to client components:

```tsx
// Server component (page)
export default async function MyPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params;
    const someData = await fetchSomeData(workspaceId);
    
    return <MyClientComponent data={someData} />;
}

// Client component
"use client";
function MyClientComponent({ data }) {
    const { workspace } = useWorkspace(); // ✅ Works here!
    return <div>{workspace.name}: {data}</div>;
}
```

## Benefits

### Before (Multiple Fetches)
```
Layout → fetch workspace ❌
Team Page → fetch workspace ❌
Settings Page → fetch workspace ❌
```
**3 API calls for the same data!**

### After (Single Fetch)
```
Layout → fetch workspace ✅ (shared with all pages)
Team Page → use context ✅
Settings Page → use context ✅
```
**1 API call, shared everywhere!**

## Available Data in Context

```typescript
interface WorkspaceData {
    id: string;
    name: string;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
    members?: {
        id: string;
        userId: string;
        workspaceId: string;
        workspaceRole: WorkspaceRole;
        user?: {
            id: string;
            name?: string | null;
            surname?: string | null;
            email: string;
            image?: string | null;
        };
    }[];
}
```

## Migration Guide

### Before
```tsx
// Old way - fetching in each page
export default async function TeamPage({ params }) {
    const { workspaceId } = await params;
    const workspace = await getWorkspaceById(workspaceId); // ❌ Redundant
    
    return <TeamMembers workspace={workspace} />;
}
```

### After
```tsx
// New way - use context in client components
"use client";
export function TeamMembers() {
    const { workspace } = useWorkspace(); // ✅ Already fetched!
    
    return <div>{workspace.name}</div>;
}
```

## When to Fetch vs Use Context

### Use Context When:
- ✅ You need basic workspace info (name, id, owner, members)
- ✅ You're in a client component
- ✅ The data is already in the workspace object

### Fetch Separately When:
- ✅ You need additional data not in workspace object (e.g., projects, tasks)
- ✅ You're in a server component/page
- ✅ You need real-time or frequently changing data

## Example: Refactoring Team Page

### Before
```tsx
async function TeamPage({ params }) {
    const { workspaceId } = await params;
    const workspace = await getWorkspaceById(workspaceId);
    const members = await getWorkspaceMembers(workspaceId);
    
    return <TeamMembers workspace={workspace} members={members} />;
}
```

### After
```tsx
// Server page - only fetch what's not in context
async function TeamPage({ params }) {
    const { workspaceId } = await params;
    const members = await getWorkspaceMembers(workspaceId);
    
    return <TeamMembers members={members} />;
}

// Client component - get workspace from context
"use client";
function TeamMembers({ members }) {
    const { workspace } = useWorkspace(); // Already has workspace data!
    
    return (
        <div>
            <h1>{workspace.name} Team</h1>
            {/* ... */}
        </div>
    );
}
```

## Performance Impact

- **Reduced API calls**: 1 call instead of N calls per page
- **Faster navigation**: Workspace data cached in React Context
- **Better UX**: No loading spinners for workspace info
- **Optimized**: Uses React's `cache()` and Next.js `unstable_cache()`
