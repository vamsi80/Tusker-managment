# Global SubTask Sheet

The SubTask Details Sheet is now globally accessible throughout the application. Any component can open the sheet by using the `useSubTaskSheet` hook.

## Features

✅ **Global Access**: Open from any component in the app  
✅ **URL Synchronization**: Automatically updates URL with subtask slug  
✅ **Shareable Links**: Users can share direct links to specific subtasks  
✅ **Type Safe**: Full TypeScript support  
✅ **Single Instance**: One sheet for the entire application  

## URL Synchronization

When you open a subtask, the URL automatically updates to include the subtask identifier:

```
Before: /w/workspace-123/p/project-456/task
After:  /w/workspace-123/p/project-456/task?subtask=fix-login-bug
```

This allows users to:
- **Share** specific subtask views with team members
- **Bookmark** important subtasks
- **Navigate** back to subtasks using browser history
- **Deep link** directly to subtasks from external tools

The URL uses the subtask's `taskSlug` (human-readable) if available, falling back to the `id` if not.

## Usage

### 1. Import the hook

```tsx
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
```

### 2. Use the hook in your component

```tsx
function YourComponent() {
    const { openSubTaskSheet, closeSubTaskSheet, isOpen, subTask } = useSubTaskSheet();
    
    // Open the sheet with a subtask
    const handleClick = (subtask: FlatTaskType | SubTaskType | PaginatedSubTaskType) => {
        openSubTaskSheet(subtask);
    };
    
    // Close the sheet programmatically (usually not needed as the sheet has its own close button)
    const handleClose = () => {
        closeSubTaskSheet();
    };
    
    return (
        <button onClick={() => handleClick(someSubtask)}>
            View Subtask Details
        </button>
    );
}
```

## API

### `useSubTaskSheet()`

Returns an object with the following properties:

- **`isOpen`** (boolean): Whether the sheet is currently open
- **`subTask`** (FlatTaskType | SubTaskType | PaginatedSubTaskType | null): The currently selected subtask
- **`openSubTaskSheet(subTask)`**: Function to open the sheet with a specific subtask
- **`closeSubTaskSheet()`**: Function to close the sheet

## Examples

### Opening from a table row

```tsx
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

function SubTaskRow({ subtask }: { subtask: FlatTaskType }) {
    const { openSubTaskSheet } = useSubTaskSheet();
    
    return (
        <tr onClick={() => openSubTaskSheet(subtask)}>
            <td>{subtask.name}</td>
            {/* ... other cells */}
        </tr>
    );
}
```

### Opening from a card

```tsx
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

function SubTaskCard({ subtask }: { subtask: SubTaskType }) {
    const { openSubTaskSheet } = useSubTaskSheet();
    
    return (
        <div 
            className="card cursor-pointer" 
            onClick={() => openSubTaskSheet(subtask)}
        >
            <h3>{subtask.name}</h3>
            <p>{subtask.description}</p>
        </div>
    );
}
```

### Opening from anywhere with subtask data

```tsx
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

function AnyComponent() {
    const { openSubTaskSheet } = useSubTaskSheet();
    
    const handleViewSubtask = async (subtaskId: string) => {
        // Fetch subtask data if needed
        const subtask = await fetchSubtaskById(subtaskId);
        
        // Open the sheet
        openSubTaskSheet(subtask);
    };
    
    return (
        <button onClick={() => handleViewSubtask("subtask-123")}>
            View Subtask
        </button>
    );
}
```

## Implementation Details

- The sheet is rendered at the root level of the application (in `app/layout.tsx`)
- The context provider wraps the entire application
- The sheet automatically handles URL synchronization (disabled for global usage to prevent conflicts)
- The sheet includes all features: comments, review comments, assignee info, dates, tags, etc.

## Migration from Local State

If you have existing components using local state for the subtask sheet, you can migrate them by:

1. Remove local state (`useState` for `isOpen` and `selectedSubTask`)
2. Remove the `<SubTaskDetailsSheet>` component from your JSX
3. Import and use `useSubTaskSheet()` hook
4. Replace `setSelectedSubTask(subtask); setIsOpen(true)` with `openSubTaskSheet(subtask)`
5. Remove the `onClose` handler as it's now handled globally

The global sheet will automatically appear when you call `openSubTaskSheet()` from anywhere in the application.
