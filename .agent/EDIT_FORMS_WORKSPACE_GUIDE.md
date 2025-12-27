# Edit Forms - Workspace Level Support Implementation Guide

## Overview

Both `edit-subtask-form.tsx` and `edit-task-form.tsx` need to be updated to support workspace-level editing with project selection, similar to the create forms.

## Changes Already Applied

### edit-subtask-form.tsx ✅
1. ✅ Added `useEffect` import
2. ✅ Added `Select` component imports  
3. ✅ Updated interface to include:
   - `level?: "workspace" | "project"`
   - `projects?: { id: string; name: string; }[]`
   - `parentTasks?: { id: string; name: string; projectId: string; }[]`
   - Made `projectId` and `parentTaskId` optional
4. ✅ Added state management:
   - `selectedProjectId`
   - `filteredParentTasks`

## Remaining Changes Needed

### 1. edit-subtask-form.tsx

#### Add useEffect for filtering (after line 88):
```tsx
// Filter parent tasks when project is selected (workspace level only)
useEffect(() => {
    if (level === "workspace" && selectedProjectId) {
        const filtered = parentTasks.filter(task => task.projectId === selectedProjectId);
        setFilteredParentTasks(filtered);
    } else {
        setFilteredParentTasks(parentTasks);
    }
}, [selectedProjectId, parentTasks, level]);
```

#### Add Project Selector in Form (find the form fields section, add before name field):
```tsx
{/* Project Selection - Only for workspace level */}
{level === "workspace" && projects.length > 0 && (
    <FormField
        control={form.control}
        name="projectId"
        render={({ field }) => (
            <FormItem>
                <FormLabel>Project *</FormLabel>
                <Select
                    onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedProjectId(value);
                    }}
                    value={field.value}
                >
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                                {project.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FormDescription>
                    Change the project for this subtask
                </FormDescription>
                <FormMessage />
            </FormItem>
        )}
    />
)}

{/* Parent Task Selection - Only for workspace level */}
{level === "workspace" && filteredParentTasks.length > 0 && (
    <FormField
        control={form.control}
        name="parentTaskId"
        render={({ field }) => (
            <FormItem>
                <FormLabel>Parent Task *</FormLabel>
                <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!selectedProjectId}
                >
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder={selectedProjectId ? "Select a parent task" : "Select a project first"} />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        {filteredParentTasks.map((task) => (
                            <SelectItem key={task.id} value={task.id}>
                                {task.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FormDescription>
                    {selectedProjectId 
                        ? "Change the parent task for this subtask" 
                        : "Please select a project first"}
                </FormDescription>
                <FormMessage />
            </FormItem>
        )}
    />
)}
```

### 2. edit-task-form.tsx

#### Update Interface:
```tsx
interface EditTaskFormProps {
    task: TaskWithSubTasks;
    projectId?: string; // Make optional for workspace level
    onTaskUpdated?: (updatedData: Partial<TaskWithSubTasks>) => void;
    level?: "workspace" | "project"; // Add level prop
    projects?: { id: string; name: string; }[]; // Add projects prop
    tags?: { id: string; name: string; }[];
}
```

#### Add State:
```tsx
const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || task.projectId || "");
```

#### Add Project Selector in Form:
```tsx
{/* Project Selection - Only for workspace level */}
{level === "workspace" && projects && projects.length > 0 && (
    <FormField
        control={form.control}
        name="projectId"
        render={({ field }) => (
            <FormItem>
                <FormLabel>Project *</FormLabel>
                <Select
                    onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedProjectId(value);
                    }}
                    value={field.value}
                >
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                                {project.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FormDescription>
                    Change the project for this task
                </FormDescription>
                <FormMessage />
            </FormItem>
        )}
    />
)}
```

## Usage Examples

### Workspace Level - Edit SubTask
```tsx
<EditSubTaskForm
    subTask={subTask}
    members={members}
    level="workspace"
    projects={projects}
    parentTasks={parentTasks}
    tags={tags}
/>
```

### Workspace Level - Edit Task
```tsx
<EditTaskForm
    task={task}
    level="workspace"
    projects={projects}
    tags={tags}
/>
```

### Project Level (Existing Behavior)
```tsx
<EditSubTaskForm
    subTask={subTask}
    members={members}
    projectId={projectId}
    parentTaskId={parentTaskId}
    tags={tags}
/>

<EditTaskForm
    task={task}
    projectId={projectId}
    tags={tags}
/>
```

## Benefits

✅ **Consistent UX** - Edit forms match create forms  
✅ **Workspace Flexibility** - Can move tasks/subtasks between projects  
✅ **Cascading Selection** - Project selection filters parent tasks  
✅ **Backward Compatible** - Project-level editing unchanged  
✅ **Clear Workflow** - Same 3-step process as create forms  

## Testing Checklist

### Edit SubTask Form
- [ ] Workspace level shows project selector
- [ ] Workspace level shows parent task selector (filtered by project)
- [ ] Project level hides project/parent task selectors
- [ ] Changing project updates parent task list
- [ ] Form submits with correct projectId and parentTaskId
- [ ] Validation works correctly

### Edit Task Form
- [ ] Workspace level shows project selector
- [ ] Project level hides project selector
- [ ] Form submits with correct projectId
- [ ] Validation works correctly
- [ ] Can move task between projects

## Implementation Status

### edit-subtask-form.tsx
- ✅ Interface updated
- ✅ Imports added
- ✅ State management added
- ⏳ useEffect for filtering (needs to be added)
- ⏳ Form fields (needs to be added)

### edit-task-form.tsx
- ⏳ Interface update (needs to be done)
- ⏳ Imports (needs to be done)
- ⏳ State management (needs to be done)
- ⏳ Form fields (needs to be done)

## Next Steps

1. Complete edit-subtask-form.tsx:
   - Add useEffect for filtering
   - Add project and parent task selectors to form

2. Update edit-task-form.tsx:
   - Follow same pattern as edit-subtask-form
   - Add project selector
   - Update interface and state

3. Update parent components to pass new props when using at workspace level

4. Test both forms at workspace and project levels
