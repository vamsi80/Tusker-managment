# Data Table - Quick Reference

## Import Everything
```tsx
import {
  DataTable,
  createMaterialColumns,
  createUserColumns,
  createVendorColumns,
  createSelectColumn,
  createActionsColumn,
  createTextColumn,
  createDateColumn,
  createBadgeColumn,
  createNumberColumn,
} from "@/components/data-table";
```

## Minimal Example
```tsx
<DataTable
  columns={columns}
  data={data}
/>
```

## Full Example
```tsx
<DataTable
  columns={columns}
  data={data}
  searchKey="name"
  searchPlaceholder="Search..."
  isLoading={false}
  onRowClick={(row) => console.log(row)}
  showPagination={true}
  showColumnToggle={true}
  pageSize={10}
/>
```

## Quick Column Builders

### Text Column
```tsx
createTextColumn<T>("fieldName", "Header", {
  truncate: 50,
  className: "font-bold"
})
```

### Date Column
```tsx
createDateColumn<T>("createdAt", "Created", "relative")
// Options: "date" | "datetime" | "relative"
```

### Badge Column
```tsx
createBadgeColumn<T>("status", "Status", {
  active: "default",
  inactive: "secondary"
})
```

### Number Column
```tsx
createNumberColumn<T>("price", "Price", {
  prefix: "₹",
  suffix: " INR",
  decimals: 2
})
```

### Actions Column
```tsx
createActionsColumn<T>([
  { label: "Edit", onClick: handleEdit, icon: <IconEdit /> },
  { label: "Delete", onClick: handleDelete, variant: "destructive" }
])
```

### Select Column
```tsx
createSelectColumn<T>()
```

## Custom Column
```tsx
{
  accessorKey: "customField",
  header: "Custom Header",
  cell: ({ row }) => <div>{row.getValue("customField")}</div>
}
```

## Pre-built Tables

### Materials
```tsx
const columns = createMaterialColumns(onEdit, onDelete, onView);
```

### Users
```tsx
const columns = createUserColumns(onEdit, onDelete, onView);
```

### Vendors
```tsx
const columns = createVendorColumns(onEdit, onDelete, onView);
```
