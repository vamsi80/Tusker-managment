# Form Usage - Project Level vs Workspace Level

## Directory Structure

### Project Level
**Path:** `src/app/w/[workspaceId]/p/[slug]`
- **Context:** Working within a specific project
- **Scope:** Single project's tasks and subtasks
- **Project ID:** Known from URL parameter `[slug]`

### Workspace Level
**Path:** `src/app/w/[workspaceId]/tasks`
- **Context:** Working across all workspace projects
- **Scope:** All tasks and subtasks from all projects
- **Project ID:** User must select from dropdown

## Form Behavior by Level

### CREATE FORMS

#### 1. CreateTaskForm

**Project Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/p/[slug]/_components/...
<CreateTaskForm
    workspaceId={workspaceId}
    projectId={projectId} // ✅ Pre-filled from URL
    level="project"
    // No projects prop needed
/>
```
- ✅ Project is pre-selected (from URL)
- ✅ User only fills: name, slug
- ✅ Project selector is HIDDEN

**Workspace Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/tasks/_components/...
<CreateTaskForm
    workspaceId={workspaceId}
    level="workspace"
    projects={projects} // ✅ Required - list of all projects
/>
```
- ✅ User must SELECT project first
- ✅ Then fills: name, slug
- ✅ Project selector is SHOWN

#### 2. CreateSubTaskForm

**Project Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/p/[slug]/_components/...
<CreateSubTaskForm
    workspaceId={workspaceId}
    projectId={projectId} // ✅ Pre-filled from URL
    parentTaskId={parentTaskId} // ✅ Pre-filled from context
    members={members}
    tags={tags}
    level="project"
    // No projects or parentTasks props needed
/>
```
- ✅ Project is pre-selected
- ✅ Parent task is pre-selected (or from dropdown within project)
- ✅ User fills: name, description, dates, assignee, etc.
- ✅ Project/Parent selectors are HIDDEN

**Workspace Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/tasks/_components/...
<CreateSubTaskForm
    workspaceId={workspaceId}
    members={members}
    tags={tags}
    level="workspace"
    projects={projects} // ✅ Required - list of all projects
    parentTasks={parentTasks} // ✅ Required - list of all parent tasks
/>
```
- ✅ User must SELECT project first
- ✅ Then SELECT parent task (filtered by project)
- ✅ Then fills: name, description, dates, assignee, etc.
- ✅ Project/Parent selectors are SHOWN

### EDIT FORMS

#### 3. EditTaskDialog

**Project Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/p/[slug]/_components/...
<EditTaskDialog
    task={task}
    projectId={task.projectId} // ✅ From task data
    level="project"
    // No projects prop needed
/>
```
- ✅ Project is fixed (cannot change)
- ✅ User edits: name, slug
- ✅ Project selector is HIDDEN

**Workspace Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/tasks/_components/...
<EditTaskDialog
    task={task}
    level="workspace"
    projects={projects} // ✅ Required - list of all projects
/>
```
- ✅ User can CHANGE project (move task)
- ✅ User edits: name, slug
- ✅ Project selector is SHOWN

#### 4. EditSubTaskForm

**Project Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/p/[slug]/_components/...
<EditSubTaskForm
    subTask={subTask}
    members={members}
    projectId={subTask.projectId} // ✅ From subtask data
    parentTaskId={subTask.parentTaskId} // ✅ From subtask data
    tags={tags}
    level="project"
    // No projects or parentTasks props needed
/>
```
- ✅ Project is fixed (cannot change)
- ✅ Parent task is fixed (cannot change)
- ✅ User edits: name, description, dates, assignee, etc.
- ✅ Project/Parent selectors are HIDDEN

**Workspace Level Usage:**
```tsx
// Location: src/app/w/[workspaceId]/tasks/_components/...
<EditSubTaskForm
    subTask={subTask}
    members={members}
    tags={tags}
    level="workspace"
    projects={projects} // ✅ Required - list of all projects
    parentTasks={parentTasks} // ✅ Required - list of all parent tasks
/>
```
- ✅ User can CHANGE project (move subtask)
- ✅ User can CHANGE parent task (filtered by project)
- ✅ User edits: name, description, dates, assignee, etc.
- ✅ Project/Parent selectors are SHOWN

## Data Requirements by Level

### Project Level
**Required Data:**
- `workspaceId` - From URL
- `projectId` - From URL (`[slug]`)
- `members` - Project members only
- `tags` - Workspace tags
- `parentTaskId` - For subtasks (from context)

**NOT Required:**
- ❌ `projects` list
- ❌ `parentTasks` list from other projects

### Workspace Level
**Required Data:**
- `workspaceId` - From URL
- `projects` - List of all workspace projects
- `members` - All workspace members
- `tags` - Workspace tags
- `parentTasks` - List of all parent tasks (with projectId)

**NOT Required:**
- ❌ Pre-selected `projectId`
- ❌ Pre-selected `parentTaskId`

## Visual Differences

### Project Level Forms
```
┌─────────────────────────────────┐
│ Create Task                     │
├─────────────────────────────────┤
│ Task Name: [____________]       │ ← User fills
│ Slug: [____________]            │ ← User fills
│                                 │
│ [Cancel] [Create Task]          │
└─────────────────────────────────┘
```
- **Simple** - Only essential fields
- **Fast** - No project selection needed

### Workspace Level Forms
```
┌─────────────────────────────────┐
│ Create Task                     │
├─────────────────────────────────┤
│ Project: [Select Project ▼]    │ ← User selects
│ Task Name: [____________]       │ ← User fills
│ Slug: [____________]            │ ← User fills
│                                 │
│ [Cancel] [Create Task]          │
└─────────────────────────────────┘
```
- **Flexible** - Can choose any project
- **Clear** - Shows project context

### Workspace Level SubTask Form (Cascading)
```
┌─────────────────────────────────┐
│ Create SubTask                  │
├─────────────────────────────────┤
│ Project: [Select Project ▼]    │ ← Step 1: Select project
│ Parent Task: [Disabled...]     │ ← Step 2: Enabled after project
│ SubTask Name: [____________]   │ ← Step 3: Fill details
│ Description: [____________]     │
│ ...                             │
│                                 │
│ [Cancel] [Create SubTask]       │
└─────────────────────────────────┘
```
- **Guided** - Clear 3-step process
- **Smart** - Parent tasks filtered by project

## Implementation Checklist

### ✅ Forms Updated
- [x] CreateTaskForm - Supports both levels
- [x] CreateSubTaskForm - Supports both levels
- [x] EditTaskDialog - Supports both levels
- [x] EditSubTaskForm - Supports both levels

### ⏳ Integration Needed

**Project Level (`src/app/w/[workspaceId]/p/[slug]`):**
- [ ] Verify all forms use `level="project"`
- [ ] Ensure projectId is passed from URL
- [ ] Confirm project/parent selectors are hidden

**Workspace Level (`src/app/w/[workspaceId]/tasks`):**
- [ ] Update forms to use `level="workspace"`
- [ ] Pass `projects` prop to all forms
- [ ] Pass `parentTasks` prop to SubTask forms
- [ ] Fetch required data in parent components

## Benefits of This Architecture

### Project Level
✅ **Faster** - No project selection needed  
✅ **Simpler** - Fewer fields to fill  
✅ **Focused** - Working within one project  
✅ **Cleaner UI** - Less visual clutter  

### Workspace Level
✅ **Flexible** - Can work across projects  
✅ **Powerful** - Move tasks between projects  
✅ **Organized** - See all work in one place  
✅ **Efficient** - Create/edit without switching projects  

## Example: User Workflows

### Scenario 1: Project Manager Working on "Website Redesign"
**Uses:** Project Level (`/w/acme/p/website-redesign`)
- Creates tasks quickly (project pre-selected)
- Adds subtasks to existing tasks
- Edits task details
- **Benefit:** Fast, focused workflow

### Scenario 2: Team Lead Reviewing All Tasks
**Uses:** Workspace Level (`/w/acme/tasks`)
- Views all tasks across all projects
- Moves misplaced tasks to correct projects
- Creates tasks in any project
- Reassigns subtasks to different parent tasks
- **Benefit:** Flexible, cross-project management

## Summary

| Feature | Project Level | Workspace Level |
|---------|--------------|-----------------|
| **Location** | `/w/[id]/p/[slug]` | `/w/[id]/tasks` |
| **Project Selection** | ❌ Hidden (pre-filled) | ✅ Shown (user selects) |
| **Parent Task Selection** | ❌ Hidden or limited | ✅ Shown (filtered by project) |
| **Can Move Tasks** | ❌ No | ✅ Yes |
| **Required Props** | Minimal | projects, parentTasks |
| **Use Case** | Focused project work | Cross-project management |

Both levels use the **same form components** with different configurations, ensuring:
- ✅ **Code Reuse** - No duplicate forms
- ✅ **Consistency** - Same UX patterns
- ✅ **Maintainability** - Single source of truth
- ✅ **Flexibility** - Adapts to context

---

**Status:** Architecture Documented ✅  
**Forms:** 4 forms, 2 levels each = 8 configurations  
**Code Reuse:** 100% (same components)  
**Backward Compatible:** Yes ✅
