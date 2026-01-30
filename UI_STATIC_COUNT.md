# UI Enhancement: Project Task Counts

## Behavior

### While Tasks Are Loading
```
Task Name (50 tasks)          ← Total count (static)
📁 Project Alpha              ← No count (loading)
📁 Project Beta
```

### After All Tasks Loaded
```
Task Name (50 tasks)          ← Total count (static)
📁 Project Alpha (12 tasks)   ← Total count (static)
📁 Project Beta (8 tasks)     ← Total count (static)
📁 Project Gamma (30 tasks)   ← Total count (static)
```

## How It Works

1. **While Loading:**
   - Main header shows total count immediately
   - Project rows show names only (no counts)
   - Tasks load silently in background

2. **After All Tasks Loaded:**
   - System calculates total tasks per project
   - Project rows show accurate total counts
   - Counts are static (don't change)

## Benefits

✅ **Accurate counts** - Only shown when all tasks are loaded  
✅ **No changing numbers** - Counts appear once and stay static  
✅ **Clean while loading** - No confusing partial counts  
✅ **Professional** - Smooth, polished experience  

## Technical Details

### Calculation
```typescript
const projectTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Only calculate if all tasks are loaded
    const allTasksLoaded = totalCount > 0 && tasks.length >= totalCount;
    
    if (allTasksLoaded) {
        tasks.forEach(task => {
            const pId = task.projectId || 'unknown';
            counts[pId] = (counts[pId] || 0) + 1;
        });
    }
    
    return counts;
}, [tasks, totalCount]);
```

### Display Logic
```tsx
{totalTasksCount !== undefined && totalTasksCount > 0 && (
    <span>({totalTasksCount} tasks)</span>
)}
```

## Files Modified

- `src/components/task/list/task-table.tsx` - Added projectTaskCounts calculation
- `src/components/task/list/project-row.tsx` - Added totalTasksCount prop and display

## Result

🎉 **Smart, accurate counts!**
- Main header: Always shows total
- Project rows: Show counts only when accurate
- No changing numbers
- Clean, professional UI
