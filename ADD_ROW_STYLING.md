# Add Row Styling for PO Items

## Goal
Visually dim/gray out rows that have POs created, making it clear they can't be selected.

## Step 1: Add getRowClassName to DataTable

**File**: `src/components/data-table/data-table.tsx`

### 1a. Add to Interface (Line ~40)

After `enableRowSelection`, add:

```typescript
    enableRowSelection?: (row: any) => boolean;
    getRowClassName?: (row: any) => string;  // ← ADD THIS
}
```

### 1b. Add to Function Params (Line ~60)

After `enableRowSelection`, add:

```typescript
    enableRowSelection,
    getRowClassName,  // ← ADD THIS
}: DataTableProps<TData, TValue> & { getRowId?: (row: TData) => string }) {
```

### 1c. Apply to TableRow (Line ~336)

Find the TableRow rendering (around line 336):

```typescript
<TableRow
    key={row.id}
    data-state={row.getIsSelected() && "selected"}
    onClick={() => onRowClick?.(row.original)}
    className={onRowClick ? "cursor-pointer" : ""}
>
```

Change to:

```typescript
<TableRow
    key={row.id}
    data-state={row.getIsSelected() && "selected"}
    onClick={() => onRowClick?.(row.original)}
    className={`
        ${onRowClick ? "cursor-pointer" : ""}
        ${getRowClassName?.(row) || ""}
    `.trim()}
>
```

## Step 2: Use in Client Component

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/client.tsx`

Add `getRowClassName` prop to DataTable (Line ~216):

```typescript
<DataTable
    columns={columns}
    data={flattenedData}
    searchKey="materialName"
    searchPlaceholder="Search materials..."
    filterFields={filterFields}
    filterDisplay="menu"
    rowSelection={rowSelection}
    onRowSelectionChange={setRowSelection}
    getRowId={(row) => row.id}
    enableRowSelection={(row) => !row.original.hasPO}
    getRowClassName={(row) => 
        row.original.hasPO ? 'opacity-50 bg-muted/30 cursor-not-allowed' : ''
    }
/>
```

## Visual Result

### Before (No PO):
```
☐ Cement - 100 bags - ₹500 - APPROVED
   Normal brightness, can select
```

### After (Has PO):
```
☑ Cement [WT/2025-2026/000001] - 100 bags - ₹500 - APPROVED
   ↑ Grayed out, dimmed, cursor shows "not-allowed"
```

## Styling Options

You can customize the styling:

### Option 1: Subtle (Recommended)
```typescript
getRowClassName={(row) => 
    row.original.hasPO ? 'opacity-50 bg-muted/30' : ''
}
```

### Option 2: More Obvious
```typescript
getRowClassName={(row) => 
    row.original.hasPO ? 'opacity-40 bg-muted/50 cursor-not-allowed line-through' : ''
}
```

### Option 3: With Border
```typescript
getRowClassName={(row) => 
    row.original.hasPO ? 'opacity-50 bg-muted/30 border-l-4 border-l-muted-foreground/30' : ''
}
```

## Complete Changes Summary

### DataTable Component (3 changes):
1. **Line ~40**: Add `getRowClassName?: (row: any) => string;` to interface
2. **Line ~60**: Add `getRowClassName,` to function params
3. **Line ~336**: Apply `getRowClassName?.(row)` to TableRow className

### Client Component (1 change):
4. **Line ~216**: Add `getRowClassName` prop to DataTable

## Testing

After making these changes:
1. Create a PO for some items
2. Refresh the page
3. **Verify**:
   - ✅ Items with POs are grayed out
   - ✅ Items with POs have muted background
   - ✅ Cursor shows "not-allowed" on hover
   - ✅ Checkbox is disabled
   - ✅ Badge shows PO number
   - ✅ Can't select these items

## CSS Classes Used

- `opacity-50`: Makes row 50% transparent
- `bg-muted/30`: Light gray background (30% opacity)
- `cursor-not-allowed`: Shows ⛔ cursor on hover
- `line-through`: Strikes through text (optional)
- `border-l-4`: Left border (optional)

✅ This provides clear visual feedback that items are frozen!
