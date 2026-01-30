# Permission Logic Verification

## Role-Based Subtask Visibility

### How It Works

The system uses the `isMember` flag to determine what subtasks a user can see:

```typescript
const isMember = !isWorkspaceAdmin && !isProjectManager && !isProjectLead;
```

### Permission Matrix

| Role | isMember | Can See |
|------|----------|---------|
| **Workspace Admin** | `false` | ✅ All subtasks in all projects |
| **Project Manager** | `false` | ✅ All subtasks in their managed projects |
| **Project Lead** | `false` | ✅ All subtasks in their led projects |
| **Member** | `true` | ⚠️ Only subtasks assigned to them |

### Implementation

**In `get-subtasks-batch.ts` and `get-subtasks.ts`:**

```typescript
// Permission filter
const permissionFilter = isMember
    ? { assignee: { id: userId } }  // Members: only assigned subtasks
    : {};                            // Admins/Managers/Leads: all subtasks
```

### For Project Managers

When a Project Manager accesses their project:

1. `getUserPermissions(workspaceId, projectId)` is called
2. Returns `isProjectManager = true`
3. Calculates `isMember = false` (because they're a manager)
4. Permission filter is empty `{}`
5. **Result:** They see ALL subtasks in the project ✅

### Verification

To verify this is working:

1. Log in as a Project Manager
2. Navigate to your managed project
3. Expand any parent task
4. You should see ALL subtasks, not just your assigned ones

### Code Locations

- Permission calculation: `src/data/user/get-user-permissions.ts` (line 131)
- Batch subtask filter: `src/data/task/list/get-subtasks-batch.ts` (line 43-48)
- Single subtask filter: `src/data/task/list/get-subtasks.ts` (line 30-35)

## Troubleshooting

If a Project Manager is NOT seeing all subtasks:

1. **Check project membership:**
   - Verify they have `PROJECT_MANAGER` role in the project
   - Check `projectMember` table in database

2. **Check permissions response:**
   - Add console.log in `getUserPermissions`
   - Verify `isProjectManager = true` and `isMember = false`

3. **Check database query:**
   - Add console.log in `_getSubTasksByParentIdsInternal`
   - Verify `permissionFilter = {}` (empty object)

## Expected Behavior

✅ **Project Managers should see:**
- All parent tasks in their project
- All subtasks under each parent task
- Subtasks assigned to anyone (not just themselves)

❌ **Project Managers should NOT see:**
- Tasks/subtasks from other projects (unless they're also a manager there)
- Tasks/subtasks from projects where they're only a member
