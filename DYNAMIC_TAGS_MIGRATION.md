# Dynamic Tags Migration Checklist

## ✅ Completed

### Schema & Data Layer
- [x] Updated Prisma schema with `Tag` model
- [x] Created `get-tags.ts` data layer functions
- [x] Created tag management server actions (create, update, delete)
- [x] Updated `subTaskSchema` to accept tag ID (string)

### UI Components
- [x] Created `TagDialog` component for tag creation/editing
- [x] Created `TagsManager` component for settings page
- [x] Updated settings page to display tags
- [x] Updated `global-filter-toolbar.tsx` to accept dynamic tags

### Server Actions
- [x] Fixed `create-subTask.ts` to use `tagId` field
- [x] Fixed `update-subTask.ts` to use `tagId` field

## 🔄 In Progress / To Do

### 1. Update Task Filters Component
**File:** `src/components/task/shared/task-filters.tsx`
**Lines:** 38, 200

**Current Issue:**
```tsx
const TAG_OPTIONS: { value: TaskTag; label: string }[] = [
    // Old enum-based tags
];

{TAG_OPTIONS.map((option) => (
    // Rendering old tags
))}
```

**Fix Needed:**
- Remove local `TAG_OPTIONS` constant
- Accept `tags` as a prop
- Update component to display dynamic tags with colors
- Update parent components to pass tags

---

### 2. Update Task Creation Action
**File:** `src/actions/task/create-task.ts`

**Current State:**
- Does NOT handle tags at all
- Only creates basic task with name and slug

**Fix Needed:**
```typescript
// Add tag handling
const newTask = await prisma.task.create({
    data: {
        name: validation.data.name,
        taskSlug: validation.data.taskSlug,
        projectId: validation.data.projectId,
        createdById: permissions.workspaceMember.id,
        tagId: validation.data.tag || null, // ADD THIS
    },
});
```

**Also Update:**
- `taskSchema` in `zodSchemas.ts` to include optional `tag` field

---

### 3. Update Task Update Action
**File:** `src/actions/task/update-task.ts`

**Check if it handles tags and update similarly to create-task**

---

### 4. Update Bulk Create Action
**File:** `src/actions/task/bulk-create-taskAndSubTask.ts`

**Check if it handles tags for bulk operations**

---

### 5. Update Task Forms (UI)

**Files to Find and Update:**
- Task creation forms
- Task editing forms
- Subtask creation forms
- Subtask editing forms

**Search for:**
```bash
# Find all form components
grep -r "taskSchema\|subTaskSchema" src/components --include="*.tsx"
```

**Changes Needed:**
- Remove any `TAG_OPTIONS` or `TAG_LABELS` imports
- Add `tags` prop to form components
- Update tag selector to use dynamic tags
- Display tags with their colors
- Pass tag ID (not enum value) to server actions

---

### 6. Update Task Display Components

**Files to Check:**
- Task table/list views
- Kanban cards
- Gantt view
- Task details sheets

**Changes Needed:**
- Ensure tag relation is included in queries (`include: { tag: true }`)
- Display tag name and color from relation
- Handle null tags gracefully

**Example:**
```tsx
{task.tag && (
    <Badge style={{ backgroundColor: task.tag.color, color: "#ffffff" }}>
        {task.tag.name}
    </Badge>
)}
```

---

### 7. Update Filter Components

**Files:**
- Any component that uses `GlobalFilterToolbar`
- Need to fetch tags and pass them as props

**Example:**
```tsx
// In parent component
const tags = await getWorkspaceTags(workspaceId);

<GlobalFilterToolbar
    tags={tags}
    // ... other props
/>
```

---

### 8. Update Type Definitions

**File:** `src/components/task/shared/types.ts`

**Check for:**
- `TaskTag` type references
- Filter types that use tag enums
- Update to use tag ID (string)

---

## 📝 Search Commands to Find All References

```bash
# Find all TAG_OPTIONS references
grep -r "TAG_OPTIONS" src/ --include="*.ts" --include="*.tsx"

# Find all TAG_LABELS references  
grep -r "TAG_LABELS" src/ --include="*.ts" --include="*.tsx"

# Find all TaskTag type references
grep -r "TaskTag" src/ --include="*.ts" --include="*.tsx"

# Find all task forms
grep -r "taskSchema\|subTaskSchema" src/components --include="*.tsx"

# Find all tag-related UI
grep -r "tag\|Tag" src/components/task --include="*.tsx" -i
```

---

## 🎯 Priority Order

1. **HIGH PRIORITY** - Fix `task-filters.tsx` (blocking filter functionality)
2. **HIGH PRIORITY** - Update `taskSchema` and `create-task.ts` (blocking task creation with tags)
3. **MEDIUM** - Update all task forms to use dynamic tag selectors
4. **MEDIUM** - Update task display components to show tag colors
5. **LOW** - Update bulk operations
6. **LOW** - Clean up unused type definitions

---

## ✨ Testing Checklist

After all updates:
- [ ] Can create tags in settings
- [ ] Can edit tags in settings
- [ ] Can delete tags in settings
- [ ] Can create task with tag
- [ ] Can edit task tag
- [ ] Can create subtask with tag
- [ ] Can edit subtask tag
- [ ] Can filter tasks by tag
- [ ] Tags display with correct colors everywhere
- [ ] Deleting a tag sets tasks' tagId to null
- [ ] No console errors related to tags
