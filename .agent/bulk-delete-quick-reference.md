# Quick Reference: Bulk Delete Feature

## How to Use

### Selecting Items

1. **Select All Tasks**
   - Click the checkbox in the table header
   - All visible tasks will be selected

2. **Select Individual Tasks**
   - Click the checkbox next to any task name
   - The task will be highlighted

3. **Select Subtasks**
   - Expand a task to view its subtasks
   - Click the checkbox next to any subtask
   - Subtasks can be selected independently of their parent task

### Deleting Selected Items

1. **Review Selection**
   - The bulk delete toolbar shows:
     - Total number of selected items
     - Breakdown: X tasks, Y subtasks

2. **Delete**
   - Click "Delete Selected" button
   - Confirm the deletion in the dialog
   - Items are removed immediately

3. **Cancel**
   - Click "Clear Selection" to deselect all items
   - Or click individual checkboxes to deselect specific items

## Keyboard Shortcuts

- `Space` - Toggle checkbox when focused
- `Tab` - Navigate between checkboxes
- `Enter` - Confirm deletion dialog

## Visual Indicators

- ✅ **Checked checkbox** - Item is selected
- ☐ **Empty checkbox** - Item is not selected
- 🔵 **Blue highlight** - Selected row (optional enhancement)
- 🗑️ **Red button** - Destructive action (delete)

## Tips

- You can mix task and subtask selections
- Filtering doesn't affect selection (selected items remain selected)
- Deleting a task doesn't automatically delete its subtasks (they must be selected separately)
- The "select all" checkbox only selects visible tasks (respects current filters)

## Next Steps

To complete the implementation:
1. Create server actions for bulk delete
2. Add toast notifications for success/error
3. Implement undo functionality (optional)
4. Add keyboard shortcuts for bulk operations (optional)
