# Indent Table Inline Editing Implementation

## Overview
Add inline editing capability for Admin/Owner users to edit indent items (quantity, vendor, price) directly in the indent table.

## Files to Modify/Create

### 1. Create Server Action: `src/actions/procurement/update-indent-item.ts`
- Create action to update individual indent item
- Validate user permissions (Admin/Owner only)
- Update quantity, vendorId, estimatedPrice
- Revalidate indent data

### 2. Update Columns: `src/app/w/[workspaceId]/procurement/indent/_components/columns.tsx`
- Add editing state management
- Convert quantity, vendor, price columns to editable fields
- Add save/cancel buttons in Actions column when editing
- Show edit button for Admin/Owner users

### 3. Update Client Component: `src/app/w/[workspaceId]/procurement/indent/_components/client.tsx`
- Pass userRole to columns
- Handle optimistic updates
- Manage editing state

## Implementation Steps

### Step 1: Create Update Action
```typescript
// src/actions/procurement/update-indent-item.ts
export async function updateIndentItem(data: {
    itemId: string;
    quantity?: number;
    vendorId?: string;
    estimatedPrice?: number;
}) {
    // Validate user is Admin/Owner
    // Update indent item
    // Revalidate cache
}
```

### Step 2: Add Editing State to Columns
- Use React state to track which row is being edited
- Show input fields when editing
- Show read-only display when not editing

### Step 3: Update Quantity Column
- Show Input when editing
- Show text when not editing

### Step 4: Update Vendor Column
- Show Select dropdown when editing
- Show vendor name when not editing

### Step 5: Update Price Column
- Show Input when editing
- Show price when not editing

### Step 6: Update Actions Column
- Show "Edit" button when not editing (Admin/Owner only)
- Show "Save" and "Cancel" buttons when editing
- Show "Create PO" button when complete and approved

## Considerations
- Only Admin/Owner can edit
- Optimistic UI updates for better UX
- Validation before saving
- Error handling and rollback
- Disable editing for APPROVED/REJECTED indents
