# Complete the PO Freeze Implementation

## Step 1: Update POItemRow Type

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/columns.tsx`

**Add these 3 lines** after line 38 (after `status: string;`):

```typescript
    // PO tracking fields
    hasPO: boolean;
    poNumber?: string;
    poStatus?: string;
```

So the complete type should look like:

```typescript
export type POItemRow = {
    id: string;
    indentId: string;
    indentKey: string;
    indentName: string;
    materialId: string;
    materialName: string;
    projectName: string;
    taskName: string | null;
    assigneeName: string | null;
    assigneeImage: string | null;
    quantity: number;
    unitId: string | null;
    unit: string | null;
    vendorId: string | null;
    vendorName: string | null;
    estimatedPrice: number | null;
    expectedDelivery: Date | null;
    status: string;
    // PO tracking fields
    hasPO: boolean;
    poNumber?: string;
    poStatus?: string;
};
```

## Step 2: Add Visual Indicator (Badge)

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/columns.tsx`

**Find the Material column** (around line 70-85) and update the cell to show PO badge:

```typescript
cell: ({ row }) => {
    const hasPO = row.original.hasPO;
    const poNumber = row.original.poNumber;
    
    return (
        <div className="flex flex-col gap-0 min-w-[200px] max-w-[200px]">
            <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="font-medium truncate">{row.original.materialName}</span>
                    <span className="text-xs text-muted-foreground truncate">{row.original.indentKey}</span>
                </div>
                {hasPO && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                        {poNumber}
                    </Badge>
                )}
            </div>
        </div>
    );
},
```

## Step 3: Add Badge Import

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/columns.tsx`

**Add Badge import** at the top of the file (around line 5):

```typescript
import { Badge } from "@/components/ui/badge";
```

## Step 4: Style Disabled Rows (Optional)

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/client.tsx`

**Add row styling** to the DataTable (around line 215):

```typescript
<DataTable
    columns={columns}
    data={flattenedData}
    rowSelection={rowSelection}
    onRowSelectionChange={setRowSelection}
    getRowId={(row) => row.id}
    enableRowSelection={(row) => !row.original.hasPO}
    // ADD THIS:
    getRowClassName={(row) => 
        row.original.hasPO ? 'opacity-50 bg-muted/30' : ''
    }
/>
```

## Visual Result

### Before (No PO):
```
☐ Cement
   IND-2026-0001
```

### After (Has PO):
```
☑ Cement                    [WT/2025-2026/000001]
   IND-2026-0001
   ↑ Grayed out, can't select
```

## Testing

1. **Create a PO** for some indent items
2. **Refresh the page**
3. **Verify**:
   - ✅ Items with POs show badge with PO number
   - ✅ Rows are grayed out
   - ✅ Checkboxes are disabled
   - ✅ Can't select them for another PO
   - ✅ Can still select items without POs

## Quick Test Query

Check in database which items have POs:

```sql
SELECT 
    ii.id,
    m.name as material,
    po.po_number
FROM indent_item ii
LEFT JOIN purchase_order_item poi ON poi.indent_item_id = ii.id
LEFT JOIN purchase_order po ON po.id = poi.purchase_order_id
LEFT JOIN material m ON m.id = ii.material_id
WHERE poi.id IS NOT NULL;
```

## Summary of Changes

✅ **Already Done:**
1. Updated data fetching to include PO items
2. Updated flattened data to track PO status
3. Disabled row selection for items with POs

📝 **Still Need:**
1. Add 3 fields to POItemRow type
2. Add Badge import
3. Update Material column cell to show badge
4. (Optional) Add row styling

Apply these 3-4 changes and the freeze functionality will be complete! 🎯
