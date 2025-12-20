# Bulk Upload Validation - Complete Guide

## ✅ NEW: Pre-Upload Validation

I've added comprehensive validation that checks your CSV data **BEFORE** starting the database transaction. This means you'll get clear, helpful error messages immediately if there are any issues!

## What Gets Validated

### 1. ✅ Invalid Assignee Emails
**Checks**: All assignee emails exist as project members

**Error Message Example**:
```
The following assignee email(s) are not members of this project: 
john@example.com, jane@example.com

Please add them to the project first or remove them from the CSV file.
```

**How to Fix**:
- Option 1: Add the users to the project first
- Option 2: Leave the "Assignee Email" column blank for those tasks
- Option 3: Use emails of existing project members

### 2. ✅ Invalid Date Formats
**Checks**: All dates are in valid YYYY-MM-DD format

**Error Message Example**:
```
Invalid date format found in the following rows. 
Please use YYYY-MM-DD format (e.g., 2024-12-20):

Row 3: "02/01/2024" (Task: Workspace Initialization - Create workspace)
Row 5: "2024-13-45" (Task: User Management - Invite members)
```

**Valid Formats**:
- ✅ `2024-12-20`
- ✅ `2024-01-15`
- ❌ `12/20/2024`
- ❌ `20-12-2024`
- ❌ `Dec 20, 2024`

### 3. ✅ Invalid Days Values
**Checks**: Days are positive numbers

**Error Message Example**:
```
Invalid days value found in the following rows. 
Please use positive numbers only:

Row 4: "abc" (Task: Backend Architecture - Design DB schema)
Row 7: "-5" (Task: Development - Setup project)
```

**Valid Values**:
- ✅ `1`, `2`, `3`, `10`, `30`
- ❌ `-5`, `abc`, `1.5`, `N/A`

## Validation Order

The validation happens in this order:
1. **Assignee emails** - Checks all emails exist in project
2. **Date formats** - Validates all dates are in YYYY-MM-DD format
3. **Days values** - Ensures all days are positive integers
4. **Transaction starts** - Only if all validations pass

## Benefits

### Before (Without Validation) ❌
- Transaction starts
- Error occurs halfway through
- Transaction rolls back
- Generic error message
- Hard to find the problem

### After (With Validation) ✅
- All data validated first
- Clear error message with row numbers
- No database transaction started
- Easy to identify and fix issues
- Fast feedback

## Example Error Messages

### Invalid Email
```
❌ The following assignee email(s) are not members of this project: 
   admin@example.com, qa@example.com
   
   Please add them to the project first or remove them from the CSV file.
```

### Invalid Date
```
❌ Invalid date format found in the following rows. 
   Please use YYYY-MM-DD format (e.g., 2024-12-20):
   
   Row 3: "02/01/2024" (Task: Workspace Initialization - Create workspace)
   Row 8: "2024-13-01" (Task: User Management - Verify access)
```

### Invalid Days
```
❌ Invalid days value found in the following rows. 
   Please use positive numbers only:
   
   Row 5: "abc" (Task: Backend Architecture - Index planning)
   Row 12: "-3" (Task: Development - Testing)
```

## Quick Checklist Before Upload

✅ **Assignee Emails**
- [ ] All emails are project members
- [ ] Or leave blank if no assignee

✅ **Dates**
- [ ] Format: `YYYY-MM-DD`
- [ ] Example: `2024-12-20`
- [ ] Or leave blank if no date

✅ **Days**
- [ ] Positive whole numbers only
- [ ] Example: `1`, `5`, `10`
- [ ] Or leave blank if no duration

✅ **Status** (if provided)
- [ ] One of: `TO_DO`, `IN_PROGRESS`, `REVIEW`, `COMPLETED`, `BLOCKED`, `HOLD`
- [ ] Uppercase with underscores

✅ **Tag** (if provided)
- [ ] One of: `DESIGN`, `PROCUREMENT`, `CONTRACTOR`
- [ ] Uppercase

## Testing Your CSV

1. **Start small** - Test with 2-3 tasks first
2. **Check the error message** - It will tell you exactly what's wrong
3. **Fix the issues** - Update your CSV based on the error
4. **Try again** - Upload the corrected file

## Files Modified

- ✅ `bulk-create-taskAndSubTask.ts`
  - Added assignee email validation
  - Added date format validation
  - Added days value validation
  - All validation happens BEFORE transaction

## Example Valid CSV

```csv
Task Name,Subtask Name,Description,Assignee Email,Start Date,Days,Status,Tag
Design Phase,,,,,,,
Design Phase,Create mockups,Design UI mockups,designer@company.com,2024-12-20,3,TO_DO,DESIGN
Design Phase,Review designs,Review and approve,manager@company.com,2024-12-23,2,TO_DO,DESIGN
Development,,,,,,,
Development,Setup project,Initialize codebase,,2024-12-25,1,IN_PROGRESS,DESIGN
```

**Note**: 
- Row 2: Parent task (no subtask, no details)
- Row 3: Subtask with all fields
- Row 4: Subtask with all fields
- Row 5: Parent task
- Row 6: Subtask with no assignee (blank is OK!)

---

**Now when you upload, you'll get immediate, clear feedback about any issues!** 🎯
