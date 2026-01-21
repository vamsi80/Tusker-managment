# Update Actions Column to Simple + Button

## Step 1: Update Imports

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/columns.tsx`

**Line 16** - Update the icon imports to include `IconPlus`:

```typescript
import { IconDots, IconFileText, IconEdit, IconTrash, IconPlus } from "@tabler/icons-react";
```

## Step 2: Replace Actions Column

**Lines 262-311** - Replace the entire actions column with this simpler version:

```typescript
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => {
                const { hasPO } = row.original;

                return (
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={hasPO}
                            onClick={() => {
                                // TODO: Implement single-item PO creation
                                console.log("Create PO for:", row.original);
                            }}
                            className="h-8 w-8 p-0"
                            title={hasPO ? "PO already created" : "Create PO"}
                        >
                            <IconPlus className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
```

## Visual Result

### Before (Dropdown Menu):
```
┌──────────────────────────────────────┐
│ Material    │ Vendor  │ Actions      │
├──────────────────────────────────────┤
│ Cement      │ ABC     │ [⋮]          │
│                        └─ Create PO  │
│                        └─ Edit       │
│                        └─ Delete     │
└──────────────────────────────────────┘
```

### After (Simple + Button):
```
┌──────────────────────────────────────┐
│ Material    │ Vendor  │ Actions      │
├──────────────────────────────────────┤
│ Cement      │ ABC     │ [+]          │
│ Steel       │ ABC     │ [+]          │
│ Cement (PO) │ ABC     │ [+] disabled │
└──────────────────────────────────────┘
```

## Features

✅ **Simple + Button**: One-click action
✅ **Disabled for PO Items**: Can't create duplicate POs
✅ **Tooltip**: Shows status on hover
✅ **Centered**: Clean alignment
✅ **Ghost Variant**: Minimal visual weight

## Behavior

- **Enabled**: Items without POs → Click to create PO
- **Disabled**: Items with POs → Grayed out, can't click
- **Tooltip**: Hover shows "Create PO" or "PO already created"

## Next Steps

After making these changes, you'll need to implement the single-item PO creation logic in the onClick handler.

This could either:
1. Open the same PO dialog with just this one item pre-selected
2. Create a quick PO creation flow for single items

✅ This gives you a clean, simple action column with just a + button!
