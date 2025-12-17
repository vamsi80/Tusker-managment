# URL Synchronization Feature

## Overview
The global subtask sheet now automatically synchronizes with the browser URL, making subtask views shareable and bookmarkable.

## How It Works

### When Opening a Subtask
1. User clicks on any subtask in the app
2. The sheet opens with subtask details
3. **URL automatically updates** to include the subtask identifier
4. URL uses the subtask's `taskSlug` (e.g., "fix-login-bug") if available
5. Falls back to subtask `id` if slug is not present

### URL Format
```
https://yourapp.com/w/{workspaceId}/p/{projectSlug}/task?subtask={taskSlug}
```

**Example:**
```
Before: https://app.com/w/ws-123/p/my-project/task
After:  https://app.com/w/ws-123/p/my-project/task?subtask=fix-login-bug
```

### When Closing the Sheet
- The `?subtask=...` parameter is removed from the URL
- URL returns to the base task view
- Browser history is preserved

## Benefits

### 1. **Shareable Links** 🔗
Team members can share direct links to specific subtasks:
```
"Hey, check out this bug: 
https://app.com/w/team/p/project/task?subtask=critical-bug-123"
```

### 2. **Bookmarkable** 🔖
Users can bookmark important subtasks for quick access:
- Bookmark frequently reviewed tasks
- Save tasks for later reference
- Create shortcuts to specific work items

### 3. **Browser Navigation** ⬅️➡️
- Use browser back/forward buttons
- Navigate through subtask history
- Return to previously viewed subtasks

### 4. **Deep Linking** 🎯
External tools can link directly to subtasks:
- Slack notifications with direct links
- Email notifications with task links
- Documentation linking to specific tasks
- Issue trackers referencing subtasks

### 5. **SEO Friendly** 🔍
Human-readable slugs in URLs:
- `?subtask=fix-login-bug` ✅ (readable)
- `?subtask=uuid-123-456-789` ❌ (not readable)

## Implementation Details

### URL Parameter
- **Parameter name**: `subtask`
- **Value**: `taskSlug` (preferred) or `id` (fallback)
- **Method**: `window.history.pushState` (no page reload)

### Lookup Logic
When opening from URL, the system checks:
1. First: Match by `taskSlug`
2. Fallback: Match by `id`
3. If found: Open the sheet and expand parent task

### Code Example
```tsx
// URL updates automatically when you call:
openSubTaskSheet(subtask);

// URL will become:
// ?subtask=fix-login-bug (if taskSlug exists)
// ?subtask=abc-123-def (if only id exists)
```

## User Experience

### Scenario 1: Sharing a Task
```
1. Alice opens a subtask "Fix Login Bug"
2. URL updates to: ?subtask=fix-login-bug
3. Alice copies the URL and sends to Bob
4. Bob clicks the link
5. Sheet opens automatically with the subtask
```

### Scenario 2: Bookmarking
```
1. Developer finds an important task
2. Opens the subtask sheet
3. URL updates automatically
4. Developer bookmarks the page
5. Later: Click bookmark → Sheet opens directly
```

### Scenario 3: Browser History
```
1. User opens Subtask A
2. Closes and opens Subtask B
3. Closes and opens Subtask C
4. Clicks browser back button
5. Subtask B opens automatically
6. Clicks back again
7. Subtask A opens automatically
```

## Technical Notes

### No Page Reload
- Uses `window.history.pushState`
- Updates URL without triggering server request
- Maintains application state
- Smooth user experience

### Automatic Cleanup
- URL parameter removed when sheet closes
- Clean URLs when not viewing subtasks
- No lingering parameters

### Conflict Prevention
- Only one subtask can be in URL at a time
- Opening new subtask replaces previous parameter
- Prevents URL pollution

## Testing

### Test Cases
1. ✅ Open subtask → URL updates with slug
2. ✅ Close subtask → URL parameter removed
3. ✅ Copy URL → Share with team → Opens correctly
4. ✅ Bookmark URL → Reopen → Sheet opens automatically
5. ✅ Browser back → Previous subtask opens
6. ✅ Subtask without slug → Uses ID instead
7. ✅ Multiple subtasks → Only latest in URL

### Browser Compatibility
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## Future Enhancements

Potential improvements:
- [ ] Add workspace and project context to URL
- [ ] Support multiple subtasks in URL (comma-separated)
- [ ] Add URL-based filters (status, assignee, etc.)
- [ ] Generate short URLs for sharing
- [ ] Track URL-based analytics

## Summary

The URL synchronization feature makes the global subtask sheet even more powerful by:
- Enabling easy sharing and collaboration
- Improving navigation and bookmarking
- Supporting deep linking from external tools
- Providing a better overall user experience

All of this happens automatically - developers just call `openSubTaskSheet()` and the URL updates seamlessly! 🚀
