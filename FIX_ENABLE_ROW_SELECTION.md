# Fix: Add enableRowSelection to DataTable

## Problem
TypeScript error: `Property 'enableRowSelection' does not exist on type 'DataTableProps'`

## Solution

### Step 1: Update DataTable Interface

**File**: `src/components/data-table/data-table.tsx`

**Line 39** - Add this line before the closing `}`:

```typescript
    enableRowSelection?: (row: any) => boolean;
```

So lines 24-40 should look like:

```typescript
interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    searchKey?: string;
    searchPlaceholder?: string;
    isLoading?: boolean;
    onRowClick?: (row: TData) => void;
    showPagination?: boolean;
    showColumnToggle?: boolean;
    pageSize?: number;
    onAdd?: () => void;
    addButtonLabel?: string;
    filterFields?: DataTableFilterField<TData>[];
    rowSelection?: Record<string, boolean>;
    onRowSelectionChange?: (value: any) => void;
    filterDisplay?: "default" | "menu";
    enableRowSelection?: (row: any) => boolean;  // ← ADD THIS LINE
}
```

### Step 2: Extract the Prop

**Line 58** - Add `enableRowSelection` to the destructured props:

```typescript
}: DataTableProps<TData, TValue> & { getRowId?: (row: TData) => string }) {
```

Change to:

```typescript
    enableRowSelection,
}: DataTableProps<TData, TValue> & { getRowId?: (row: TData) => string }) {
```

So lines 42-59 should look like:

```typescript
export function DataTable<TData, TValue>({
    columns,
    data,
    searchKey,
    searchPlaceholder = "Search...",
    isLoading = false,
    onRowClick,
    showPagination = true,
    showColumnToggle = true,
    pageSize = 10,
    onAdd,
    addButtonLabel = "Add New",
    filterDisplay = "default",
    filterFields = [],
    rowSelection: controlledRowSelection,
    onRowSelectionChange: controlledOnRowSelectionChange,
    getRowId,
    enableRowSelection,  // ← ADD THIS LINE
}: DataTableProps<TData, TValue> & { getRowId?: (row: TData) => string }) {
```

### Step 3: Pass to useReactTable

**Line 68-93** - Add `enableRowSelection` to the table config:

Find the `useReactTable` call and add `enableRowSelection` option:

```typescript
const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: showPagination ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId,
    enableRowSelection,  // ← ADD THIS LINE
    state: {
        sorting,
        columnFilters,
        columnVisibility,
        rowSelection,
    },
    initialState: {
        pagination: {
            pageSize: pageSize,
        },
    },
});
```

## Complete Changes Summary

**3 changes needed in `src/components/data-table/data-table.tsx`:**

1. **Line 40** (after `filterDisplay`): Add `enableRowSelection?: (row: any) => boolean;`
2. **Line 58** (in function params): Add `enableRowSelection,`
3. **Line 81** (in useReactTable): Add `enableRowSelection,`

## After These Changes

The TypeScript error will be fixed and you can use:

```typescript
<DataTable
    // ... other props
    enableRowSelection={(row) => !row.original.hasPO}
/>
```

This will:
- ✅ Disable checkboxes for items with POs
- ✅ Prevent selection of frozen items
- ✅ Fix the TypeScript error

## Test

After making these changes:
1. Save the file
2. TypeScript error should disappear
3. Items with POs will have disabled checkboxes
4. You can only select items without POs

✅ Done!
