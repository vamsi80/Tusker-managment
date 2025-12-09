# Kanban Board - Complete Documentation

## 🎯 Overview

A modern, production-ready Kanban board built with React, TypeScript, Tailwind CSS, and @dnd-kit for smooth drag-and-drop functionality.

## ✨ Features

### Core Features
- ✅ **6 Status Columns**: TO_DO, IN_PROGRESS, BLOCKED, REVIEW, COMPLETED, CANCELED
- ✅ **Drag & Drop**: Smooth drag-and-drop between columns and within columns
- ✅ **Animated Cards**: Hover effects, drag overlays, and smooth transitions
- ✅ **Assignee Avatars**: Visual representation of task ownership
- ✅ **Due Date Tracking**: With overdue indicators
- ✅ **Comment Count**: Shows number of comments per task
- ✅ **Tag Badges**: Color-coded tags (DESIGN, PROCUREMENT, CONTRACTOR)
- ✅ **Parent Task Reference**: Shows which parent task the subtask belongs to
- ✅ **Responsive Design**: Works on all screen sizes
- ✅ **Dark Mode Support**: Full dark mode compatibility

### Visual Features
- **Colored Headers**: Each column has a unique color scheme
- **Status Indicators**: Left border color coding on cards
- **Empty States**: Helpful "Drop tasks here" message
- **Task Count Badges**: Shows number of tasks in each column
- **Overdue Alerts**: Red highlighting for overdue tasks
- **Drag Overlay**: Rotated preview while dragging

## 📁 File Structure

```
kanban/
├── page.tsx                          # Main Kanban page
└── _components/
    ├── types.ts                      # TypeScript interfaces
    ├── kanban-board.tsx              # Main board component
    ├── kanban-column.tsx             # Column component
    ├── kanban-card.tsx               # Card component
    └── sample-data.ts                # Sample data for testing
```

## 🏗️ Component Architecture

### 1. KanbanBoard (Main Container)
- Manages drag-and-drop state
- Handles task movement between columns
- Provides drag overlay
- Coordinates all columns

### 2. KanbanColumn (Column Container)
- Droppable area for tasks
- Colored header with status
- Task count badge
- Scrollable content area
- Empty state handling

### 3. KanbanCard (Task Card)
- Draggable task item
- Displays all task information
- Click handler for details
- Status-based styling
- Hover animations

## 🎨 Color Scheme

| Status | Header Color | Border Color | Theme |
|--------|-------------|--------------|-------|
| TO_DO | Gray | Gray | Neutral |
| IN_PROGRESS | Blue | Blue | Active |
| BLOCKED | Red | Red | Alert |
| REVIEW | Yellow | Yellow | Warning |
| COMPLETED | Green | Green | Success |
| CANCELED | Gray | Light Gray | Muted |

## 🔧 Usage

### Basic Implementation

```tsx
import { KanbanBoard } from "./_components/kanban-board";
import { sampleKanbanData } from "./_components/sample-data";

export default function KanbanPage() {
    const handleTaskMove = (taskId: string, newStatus: string) => {
        // Update task status in your database
        console.log(`Task ${taskId} moved to ${newStatus}`);
    };

    const handleCardClick = (task: KanbanSubTask) => {
        // Open task details
        console.log('Card clicked:', task);
    };

    return (
        <KanbanBoard
            columns={sampleKanbanData}
            onTaskMove={handleTaskMove}
            onCardClick={handleCardClick}
        />
    );
}
```

### With Real Data

```tsx
// Fetch your subtasks from the database
const subtasks = await getProjectSubTasks(projectId);

// Transform to Kanban format
const columns: KanbanColumn[] = [
    {
        id: 'todo',
        title: 'To Do',
        status: 'TO_DO',
        color: 'text-gray-700 dark:text-gray-300',
        bgColor: 'bg-gray-100 dark:bg-gray-800',
        tasks: subtasks.filter(t => t.status === 'TO_DO'),
    },
    // ... other columns
];

return <KanbanBoard columns={columns} onTaskMove={handleTaskMove} />;
```

## 📊 Data Structure

### KanbanSubTask Interface

```typescript
interface KanbanSubTask {
    id: string;                    // Unique task ID
    name: string;                  // Task name
    description?: string;          // Optional description
    status: Status;                // Current status
    assignee?: {                   // Optional assignee
        id: string;
        name: string;
        surname?: string;
        image?: string;
    };
    tag?: 'DESIGN' | 'PROCUREMENT' | 'CONTRACTOR';
    startDate?: string;            // ISO date string
    days?: number;                 // Duration in days
    commentCount?: number;         // Number of comments
    parentTaskName?: string;       // Parent task reference
}
```

### KanbanColumn Interface

```typescript
interface KanbanColumn {
    id: string;                    // Unique column ID
    title: string;                 // Display title
    status: Status;                // Column status
    color: string;                 // Text color class
    bgColor: string;               // Background color class
    tasks: KanbanSubTask[];        // Tasks in this column
}
```

## 🎯 Integration Guide

### 1. Connect to Your Database

```typescript
// In your page.tsx
const fetchKanbanData = async (projectId: string) => {
    const subtasks = await prisma.task.findMany({
        where: {
            projectId,
            parentTaskId: { not: null }, // Only subtasks
        },
        include: {
            assignee: {
                include: {
                    workspaceMember: {
                        include: {
                            user: true,
                        },
                    },
                },
            },
            _count: {
                select: { comments: true },
            },
        },
    });

    // Transform to Kanban format
    return transformToKanbanColumns(subtasks);
};
```

### 2. Update Task Status

```typescript
const handleTaskMove = async (taskId: string, newStatus: Status) => {
    try {
        await prisma.task.update({
            where: { id: taskId },
            data: { status: newStatus },
        });

        toast.success(`Task moved to ${newStatus}`);
        router.refresh();
    } catch (error) {
        toast.error('Failed to update task');
    }
};
```

### 3. Open Task Details

```typescript
const handleCardClick = (task: KanbanSubTask) => {
    // Use your existing SubTaskDetailsSheet
    setSelectedSubTask(task);
    setIsSheetOpen(true);
};
```

## 🚀 Advanced Features

### Custom Filtering

```typescript
// Filter by assignee
const myTasks = columns.map(col => ({
    ...col,
    tasks: col.tasks.filter(t => t.assignee?.id === currentUserId),
}));

// Filter by tag
const designTasks = columns.map(col => ({
    ...col,
    tasks: col.tasks.filter(t => t.tag === 'DESIGN'),
}));
```

### Search Functionality

```typescript
const [searchQuery, setSearchQuery] = useState('');

const filteredColumns = columns.map(col => ({
    ...col,
    tasks: col.tasks.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
}));
```

### Sorting

```typescript
// Sort by due date
const sortedColumns = columns.map(col => ({
    ...col,
    tasks: [...col.tasks].sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate) : new Date();
        const dateB = b.startDate ? new Date(b.startDate) : new Date();
        return dateA.getTime() - dateB.getTime();
    }),
}));
```

## 🎨 Customization

### Change Column Colors

```typescript
const customColumns: KanbanColumn[] = [
    {
        id: 'todo',
        title: 'Backlog',
        status: 'TO_DO',
        color: 'text-purple-700 dark:text-purple-300',
        bgColor: 'bg-purple-100 dark:bg-purple-900',
        tasks: [],
    },
    // ... more columns
];
```

### Add Custom Badges

```tsx
// In kanban-card.tsx
{task.priority && (
    <Badge variant="destructive" className="text-[10px]">
        {task.priority}
    </Badge>
)}
```

### Custom Card Layout

```tsx
// Modify CardContent in kanban-card.tsx
<CardContent className="p-3 pt-0 space-y-2">
    {/* Add your custom fields */}
    {task.customField && (
        <div className="text-xs">
            {task.customField}
        </div>
    )}
</CardContent>
```

## 📱 Responsive Design

The Kanban board is fully responsive:
- **Desktop**: Shows all columns side by side
- **Tablet**: Horizontal scroll with visible columns
- **Mobile**: Horizontal scroll with optimized card width

## ♿ Accessibility

- Keyboard navigation support
- ARIA labels on interactive elements
- Focus indicators
- Screen reader friendly

## 🔒 Security Considerations

When integrating with your backend:

1. **Validate permissions** before allowing task moves
2. **Sanitize user input** in task descriptions
3. **Rate limit** API calls for task updates
4. **Audit log** all status changes

## 🐛 Troubleshooting

### Cards not dragging
- Ensure @dnd-kit packages are installed
- Check that task IDs are unique
- Verify sensor configuration

### Columns not updating
- Check that `onTaskMove` callback is working
- Verify state management
- Ensure router.refresh() is called

### Styling issues
- Confirm Tailwind CSS is configured
- Check dark mode classes
- Verify custom scrollbar styles

## 📦 Dependencies

```json
{
  "@dnd-kit/core": "^6.0.0",
  "@dnd-kit/sortable": "^7.0.0",
  "@dnd-kit/utilities": "^3.2.0",
  "lucide-react": "latest",
  "sonner": "latest"
}
```

## 🎯 Performance Tips

1. **Virtualize long lists** if you have 100+ tasks per column
2. **Memoize components** to prevent unnecessary re-renders
3. **Debounce API calls** when updating task status
4. **Use optimistic updates** for better UX

## 🚀 Next Steps

1. **Connect to your database** using the integration guide
2. **Add filtering and search** for better task management
3. **Implement task details modal** for editing
4. **Add real-time updates** with WebSockets
5. **Create analytics dashboard** for task metrics

## 📝 License

This Kanban board implementation is part of your Tusker Management system.

---

**Built with ❤️ using React, TypeScript, Tailwind CSS, and @dnd-kit**
