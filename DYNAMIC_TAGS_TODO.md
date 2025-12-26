# Additional Integration Tasks for Dynamic Tags

## ✅ Completed
1. Updated `subTaskSchema` in `zodSchemas.ts` to accept tag ID (string UUID) instead of enum
2. Removed `TaskTag` enum and related constants from `zodSchemas.ts`
3. Fixed `create-subTask.ts` to use `tagId` field
4. Fixed `update-subTask.ts` to use `tagId` field

## 🔧 Remaining Tasks

### 1. Update Task Filter Components

**Files to update:**
- `src/components/task/shared/global-filter-toolbar.tsx`
- `src/components/task/shared/task-filters.tsx`

**Changes needed:**
- Remove import of `TAG_OPTIONS` from `zodSchemas`
- Fetch dynamic tags from the workspace
- Update tag filter dropdown to display dynamic tags with colors
- Pass tags as props from parent components

### 2. Update Task Creation/Edit Forms

**Files to check:**
- `src/components/task/forms/*` (any task/subtask creation forms)
- Look for any hardcoded tag dropdowns using the old enum

**Changes needed:**
- Replace enum-based tag selectors with dynamic tag selectors
- Fetch workspace tags and display them with colors
- Update form submission to send tag ID instead of enum value

### 3. Update Task Display Components

**Files to check:**
- Any components that display task tags
- Components that show tag badges/pills

**Changes needed:**
- Ensure tag is loaded via relation (include `tag` in Prisma queries)
- Display tag name and color from the tag object
- Handle cases where tag might be null

### 4. Update Type Definitions

**Files to check:**
- `src/components/task/shared/types.ts`
- Any files that define `TaskTag` type

**Changes needed:**
- Remove or update `TaskTag` type definition
- Update task types to include tag relation object instead of enum

### 5. Data Migration (Optional but Recommended)

If you have existing tasks with the old enum values, you should:

**Option A: Create default tags**
```typescript
// Create migration script to:
1. Create three default tags: DESIGN, PROCUREMENT, CONTRACTOR
2. Map existing task enum values to new tag IDs
3. Update all tasks to use the new tag IDs
```

**Option B: Clear existing tags**
```typescript
// Simply clear all existing tag values
// Users will need to re-tag their tasks
UPDATE tasks SET tagId = NULL;
```

## 📝 Quick Reference: How to Use Dynamic Tags

### Fetching Tags in Components
```typescript
import { getWorkspaceTags } from "@/data/tag/get-tags";

// In server component
const tags = await getWorkspaceTags(workspaceId);

// Pass to client component
<TaskForm tags={tags} />
```

### Displaying Tags with Colors
```tsx
{task.tag && (
  <Badge style={{ backgroundColor: task.tag.color, color: "#ffffff" }}>
    {task.tag.name}
  </Badge>
)}
```

### Tag Selector in Forms
```tsx
<Select value={selectedTagId} onValueChange={setSelectedTagId}>
  <SelectTrigger>
    <SelectValue placeholder="Select a tag" />
  </SelectTrigger>
  <SelectContent>
    {tags.map((tag) => (
      <SelectItem key={tag.id} value={tag.id}>
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: tag.color }}
          />
          {tag.name}
        </div>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

## 🔍 Finding All References

Use these search patterns to find files that need updating:

```bash
# Find TAG_OPTIONS usage
grep -r "TAG_OPTIONS" src/

# Find TaskTag type usage
grep -r "TaskTag" src/

# Find TAG_LABELS usage
grep -r "TAG_LABELS" src/

# Find old enum values
grep -r "DESIGN\|PROCUREMENT\|CONTRACTOR" src/ --include="*.ts" --include="*.tsx"
```

## ⚠️ Important Notes

1. **Tag Relation**: Always include the tag relation when fetching tasks if you need to display tag information:
   ```typescript
   include: {
     tag: true
   }
   ```

2. **Null Handling**: Tags are optional, so always check for null:
   ```typescript
   task.tag?.name
   task.tag?.color
   ```

3. **Permission Checks**: Only workspace admins can manage tags. Regular users can only select from existing tags.

4. **Validation**: Tag IDs should be validated as UUIDs in forms and schemas.
