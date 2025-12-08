# Global Slug Generator Utility

## Overview
Created a reusable slug generator utility that can be used anywhere in the application to generate unique slugs with automatic conflict resolution.

## Location
`src/lib/slug-generator.ts`

## Functions

### 1. `generateUniqueSlug()`
Generate a single unique slug with automatic numbering for conflicts.

**Parameters:**
- `baseName: string` - The name to generate slug from
- `tableName: 'task' | 'project' | 'workspace'` - Database table to check
- `prefix?: string` - Optional prefix (e.g., parent task slug)
- `existingSlugs?: string[]` - Additional slugs to check against

**Returns:** `Promise<string>` - A unique slug

**Examples:**
```typescript
// Simple usage
const slug = await generateUniqueSlug("Foundation Work", "task");
// Returns: "foundation-work" or "foundation-work-1" if exists

// With prefix (for subtasks)
const slug = await generateUniqueSlug("Install Wiring", "task", "electrical-work");
// Returns: "electrical-work-install-wiring" or "electrical-work-install-wiring-1"

// Batch operation
const slugs = [];
for (const name of names) {
  const slug = await generateUniqueSlug(name, "task", undefined, slugs);
  slugs.push(slug);
}
```

### 2. `generateUniqueSlugs()`
Generate multiple unique slugs in batch (more efficient for bulk operations).

**Parameters:**
- `names: string[]` - Array of names to generate slugs from
- `tableName: 'task' | 'project' | 'workspace'` - Database table to check
- `prefix?: string` - Optional prefix for all slugs

**Returns:** `Promise<string[]>` - Array of unique slugs

**Examples:**
```typescript
// Basic batch generation
const names = ["Foundation Work", "Foundation Work", "Electrical"];
const slugs = await generateUniqueSlugs(names, "task");
// Returns: ["foundation-work", "foundation-work-1", "electrical"]

// With prefix for subtasks
const slugs = await generateUniqueSlugs(
  ["Install", "Install", "Test"],
  "task",
  "electrical-work"
);
// Returns: [
//   "electrical-work-install",
//   "electrical-work-install-1",
//   "electrical-work-test"
// ]
```

### 3. `slugExists()`
Check if a slug already exists in the database.

**Parameters:**
- `slug: string` - The slug to check
- `tableName: 'task' | 'project' | 'workspace'` - Database table to check

**Returns:** `Promise<boolean>` - true if exists, false otherwise

**Example:**
```typescript
const exists = await slugExists("foundation-work", "task");
if (exists) {
  console.log("Slug already taken!");
}
```

## How It Works

### Conflict Resolution Algorithm
1. Generate base slug from name using `slugify()`
2. Add prefix if provided
3. Query database for all slugs starting with the base slug
4. If no conflict, return the base slug
5. If conflict exists, append `-1`, `-2`, `-3`, etc. until unique
6. For batch operations, track generated slugs to prevent duplicates within the batch

### Example Flow
```
Input: "Foundation Work" (already exists in DB)
↓
Base slug: "foundation-work"
↓
Check DB: "foundation-work" exists
↓
Try: "foundation-work-1" → exists
↓
Try: "foundation-work-2" → available!
↓
Return: "foundation-work-2"
```

## Usage in Your Application

### For Bulk Create Subtasks
```typescript
import { generateUniqueSlugs } from "@/lib/slug-generator";

// In bulkCreateSubTasks action
const taskNames = data.subTasks.map(st => st.name);
const finalSlugs = await generateUniqueSlugs(
    taskNames,
    'task',
    parentTask.taskSlug  // prefix with parent task slug
);
```

### For Single Task Creation
```typescript
import { generateUniqueSlug } from "@/lib/slug-generator";

// In createTask action
const slug = await generateUniqueSlug(
    taskName,
    'task'
);
```

### For Projects
```typescript
import { generateUniqueSlug } from "@/lib/slug-generator";

// In createProject action
const slug = await generateUniqueSlug(
    projectName,
    'project'
);
```

### For Workspaces
```typescript
import { generateUniqueSlug } from "@/lib/slug-generator";

// In createWorkspace action
const slug = await generateUniqueSlug(
    workspaceName,
    'workspace'
);
```

## Benefits

1. **Reusable**: Single source of truth for slug generation
2. **Automatic Conflict Resolution**: No more manual slug errors
3. **Batch Optimized**: Efficient for bulk operations
4. **Type Safe**: Full TypeScript support
5. **Database Agnostic**: Works with tasks, projects, and workspaces
6. **Prefix Support**: Perfect for hierarchical structures (subtasks)

## Migration Guide

### Before (Custom Logic)
```typescript
// Custom slug generation with manual conflict checking
const uniqueSlugs = data.subTasks.map(st => `${parentTask.taskSlug}-${st.taskSlug}`);
const existingSlugs = await prisma.task.findMany({...});
// ... manual conflict resolution logic
```

### After (Global Utility)
```typescript
// Simple one-liner
const finalSlugs = await generateUniqueSlugs(
    taskNames,
    'task',
    parentTask.taskSlug
);
```

## Testing

### Test Cases to Verify
1. **No conflicts**: Returns original slug
2. **Single conflict**: Appends `-1`
3. **Multiple conflicts**: Finds next available number
4. **Batch duplicates**: Handles duplicates within same batch
5. **With prefix**: Correctly combines prefix and slug
6. **Different tables**: Works for task, project, workspace

### Example Test
```typescript
// Upload same file twice
const names = ["Task 1", "Task 2"];

// First upload
const slugs1 = await generateUniqueSlugs(names, "task");
// Returns: ["task-1", "task-2"]

// Second upload (conflicts with first)
const slugs2 = await generateUniqueSlugs(names, "task");
// Returns: ["task-1-1", "task-2-1"]

// Third upload
const slugs3 = await generateUniqueSlugs(names, "task");
// Returns: ["task-1-2", "task-2-2"]
```

## Future Enhancements

Potential improvements:
1. Add caching for frequently checked slugs
2. Support custom separators (e.g., `_` instead of `-`)
3. Add slug validation rules
4. Support for custom numbering patterns
5. Bulk slug reservation for transactions
