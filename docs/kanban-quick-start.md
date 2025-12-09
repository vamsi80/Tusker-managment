# Kanban Board - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Navigate to Kanban View
```
http://localhost:3000/w/{workspaceId}/p/{projectSlug}/kanban
```

### Step 2: See It in Action
The board is pre-loaded with sample data showing all 6 status columns:
- **To Do** (Gray) - New tasks
- **In Progress** (Blue) - Active work
- **Blocked** (Red) - Waiting on dependencies
- **In Review** (Yellow) - Ready for review
- **Completed** (Green) - Done
- **Canceled** (Gray) - Discontinued

### Step 3: Try Drag & Drop
1. Click and hold any task card
2. Drag it to a different column
3. Release to drop
4. See the toast notification confirming the move

### Step 4: Explore Features
- **Hover** over cards to see animations
- **Click** on a card to trigger the click handler (ready for your details modal)
- **Check** assignee avatars, due dates, and comment counts
- **Notice** overdue tasks highlighted in red

## 🎨 Visual Features You'll See

### Card Elements
```
┌─────────────────────────────────┐
│ Task Name              [Avatar] │ ← Header with assignee
│ Description text...             │ ← Optional description
│ [DESIGN] [Parent Task]          │ ← Tag badges
│ 📅 15 Jan  ⏰ 5d  💬 3          │ ← Due date, duration, comments
└─────────────────────────────────┘
```

### Column Layout
```
┌─────────────────────────────────┐
│ To Do                        2  │ ← Colored header + count
├─────────────────────────────────┤
│ [Task Card 1]                   │
│ [Task Card 2]                   │
│                                 │
│ Drop tasks here                 │ ← Empty state
└─────────────────────────────────┘
```

## 🔗 Integration Steps

### 1. Connect to Your Database

Replace sample data in `page.tsx`:

```tsx
// Remove this:
import { sampleKanbanData } from "./_components/sample-data";

// Add this:
import { getProjectSubTasks } from "@/app/data/task/get-project-tasks";

// In your component:
const subtasks = await getProjectSubTasks(projectId);

// Transform to Kanban format:
const columns = transformToKanbanColumns(subtasks);
```

### 2. Create Transform Function

```tsx
function transformToKanbanColumns(subtasks: SubTask[]): KanbanColumn[] {
    const statuses: KanbanSubTask['status'][] = [
        'TO_DO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'COMPLETED', 'CANCELED'
    ];

    return statuses.map(status => ({
        id: status.toLowerCase(),
        title: status.replace('_', ' '),
        status,
        color: getStatusColor(status),
        bgColor: getStatusBgColor(status),
        tasks: subtasks
            .filter(t => t.status === status)
            .map(transformSubTaskToKanban),
    }));
}
```

### 3. Implement Task Move Handler

```tsx
const handleTaskMove = async (taskId: string, newStatus: Status) => {
    try {
        // Update in database
        await updateSubTaskStatus(taskId, newStatus);
        
        // Show success
        toast.success(`Task moved to ${newStatus.replace('_', ' ')}`);
        
        // Refresh data
        router.refresh();
    } catch (error) {
        toast.error('Failed to update task');
    }
};
```

### 4. Add Task Details Modal

```tsx
const handleCardClick = (task: KanbanSubTask) => {
    // Use your existing SubTaskDetailsSheet
    setSelectedSubTask(task);
    setIsSheetOpen(true);
};

// In your JSX:
<SubTaskDetailsSheet
    subTask={selectedSubTask}
    isOpen={isSheetOpen}
    onClose={() => setIsSheetOpen(false)}
/>
```

## 🎯 Common Customizations

### Add Search Bar

```tsx
const [search, setSearch] = useState('');

const filteredColumns = columns.map(col => ({
    ...col,
    tasks: col.tasks.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase())
    ),
}));

// In JSX:
<Input
    placeholder="Search tasks..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
/>
```

### Add Filter by Assignee

```tsx
const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);

const filteredColumns = columns.map(col => ({
    ...col,
    tasks: col.tasks.filter(t =>
        !selectedAssignee || t.assignee?.id === selectedAssignee
    ),
}));
```

### Add Statistics

```tsx
const stats = {
    total: columns.reduce((sum, col) => sum + col.tasks.length, 0),
    completed: columns.find(c => c.status === 'COMPLETED')?.tasks.length || 0,
    blocked: columns.find(c => c.status === 'BLOCKED')?.tasks.length || 0,
    overdue: columns.flatMap(c => c.tasks).filter(isOverdue).length,
};
```

## 📱 Responsive Behavior

### Desktop (>1024px)
- All 6 columns visible side by side
- Optimal for drag & drop

### Tablet (768px - 1024px)
- Horizontal scroll
- 2-3 columns visible at once

### Mobile (<768px)
- Horizontal scroll
- 1 column visible at once
- Touch-friendly drag & drop

## 🎨 Theming

The board automatically adapts to your app's theme:
- Light mode: Bright, clean colors
- Dark mode: Muted, eye-friendly colors

## ⚡ Performance

Current implementation handles:
- ✅ Up to 100 tasks per column smoothly
- ✅ Instant drag & drop feedback
- ✅ Optimized re-renders

For 100+ tasks per column:
- Consider implementing virtual scrolling
- Use `react-window` or `react-virtual`

## 🐛 Common Issues

### Issue: Cards not dragging
**Solution**: Ensure @dnd-kit is installed:
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Issue: Columns not updating after drag
**Solution**: Check that `onTaskMove` callback is implemented

### Issue: Dark mode colors not working
**Solution**: Verify Tailwind dark mode is enabled in `tailwind.config.js`

## 🎓 Learning Resources

### Understanding the Code
1. **types.ts** - Data structures
2. **kanban-card.tsx** - Individual task cards
3. **kanban-column.tsx** - Column containers
4. **kanban-board.tsx** - Main drag & drop logic
5. **page.tsx** - Page integration

### Key Concepts
- **DndContext**: Manages drag & drop state
- **Droppable**: Makes columns accept drops
- **Sortable**: Makes cards draggable
- **DragOverlay**: Shows preview while dragging

## 🚀 Next Features to Add

1. **Bulk Actions**
   - Select multiple tasks
   - Move all selected to a column

2. **Quick Edit**
   - Inline editing of task name
   - Quick assignee change

3. **Filters**
   - By assignee
   - By tag
   - By due date

4. **Analytics**
   - Tasks per status chart
   - Completion rate
   - Average time in each status

5. **Keyboard Shortcuts**
   - Arrow keys to navigate
   - Enter to open details
   - Escape to close

## 📞 Support

If you encounter issues:
1. Check the full documentation in `docs/kanban-board-guide.md`
2. Review the sample data in `sample-data.ts`
3. Inspect browser console for errors

---

**Happy Kanban-ing! 🎉**
