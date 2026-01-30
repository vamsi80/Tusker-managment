# Feature: Silent Background Loading

## Behavior

When you click **"Expand All"**, the system now:

### Immediate Response (No Waiting!)
1. ✅ **Instantly expands all currently loaded tasks**
   - No loading spinner
   - No blocking UI
   - User can interact immediately

2. ✅ **Shows total count**
   - "Showing 9 of 50 tasks"
   - User knows how many tasks exist
   - Clear progress indication

### Background Loading (Silent)
3. ✅ **Loads remaining tasks in background**
   - No loading spinner blocking the UI
   - Tasks appear as they load
   - Newly loaded tasks auto-expand
   - User can scroll, click, interact while loading

4. ✅ **Loads all subtasks**
   - Batch fetch for optimal performance
   - Uses cache for already-loaded subtasks
   - No duplicate keys

## User Experience

**Before:**
1. Click "Expand All"
2. See loading spinner ⏳
3. Wait for all tasks to load
4. Can't interact during loading ❌

**After:**
1. Click "Expand All"
2. Currently loaded tasks expand instantly ✅
3. See "Showing 9 of 50 tasks" ✅
4. Can interact immediately ✅
5. More tasks appear in background ✅
6. All tasks auto-expand as they load ✅

## Technical Details

### Non-Blocking Async
```typescript
// Wrap in IIFE to run in background
(async () => {
    // Load tasks without blocking
    while (moreTasksAvailable) {
        // Fetch next page
        // Auto-expand new tasks
        // Update UI incrementally
    }
})();
```

### No Loading State
- Removed `setLoadingMoreTasks(true)`
- No spinner shown to user
- Silent error handling (no toast interruptions)

### Auto-Expand New Tasks
```typescript
// As each page loads, auto-expand those tasks
setExpanded(prev => {
    const newExpanded = { ...prev };
    newTasks.forEach(task => {
        newExpanded[task.id] = true;
    });
    return newExpanded;
});
```

## Benefits

✅ **Instant feedback** - No waiting for anything  
✅ **Progressive loading** - Tasks appear as they load  
✅ **Non-blocking** - User can interact immediately  
✅ **Total count visible** - User knows what to expect  
✅ **Smooth UX** - No jarring loading states  
✅ **Auto-expand** - New tasks expand automatically  

## Files Modified

- `src/components/task/list/task-table.tsx` - `handleExpandAll` function

## Result

🎉 **Best possible UX!**
- Click "Expand All" → Instant response
- See total count → Know what's coming
- Interact immediately → No waiting
- Tasks load in background → Smooth experience
