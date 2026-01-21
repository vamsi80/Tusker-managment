# Freeze Indent Items After PO Creation

## Goal
Prevent indent items that have already been used to create a PO from being selected again for another PO.

## Prerequisites

### 1. Database Schema Must Have PO Models

**Check if you've run the migration:**
```bash
npx prisma migrate status
```

**If not migrated, run:**
```bash
npx prisma migrate dev --name add_purchase_orders
```

The schema should have:
```prisma
model PurchaseOrderItem {
  id              String  @id @default(uuid())
  purchaseOrderId String
  indentItemId    String?  // ← This links to IndentItem
  
  indentItem      IndentItem? @relation(fields: [indentItemId], references: [id])
  // ... other fields
}

model IndentItem {
  // ... existing fields
  purchaseOrderItems PurchaseOrderItem[]  // ← Relation
}
```

## Implementation Steps

### Step 1: Update Data Fetching

**File**: `src/app/w/[workspaceId]/procurement/po/page.tsx`

Modify the `getIndentRequests` call to include PO item information:

```typescript
// In page.tsx, update the data fetching
const indentsData = await getIndentRequests(workspaceId);
```

### Step 2: Update get-indent-requests.ts

**File**: `src/data/procurement/get-indent-requests.ts`

Add `purchaseOrderItems` to the items select:

```typescript
items: {
    select: {
        id: true,
        materialId: true,
        quantity: true,
        unitId: true,
        vendorId: true,
        estimatedPrice: true,
        status: true,
        material: {
            select: {
                id: true,
                name: true,
            },
        },
        unit: {
            select: {
                id: true,
                abbreviation: true,
            },
        },
        vendor: {
            select: {
                id: true,
                name: true,
            },
        },
        // ADD THIS:
        purchaseOrderItems: {
            select: {
                id: true,
                purchaseOrderId: true,
                purchaseOrder: {
                    select: {
                        poNumber: true,
                        status: true,
                    }
                }
            }
        },
    },
},
```

### Step 3: Update POItemRow Type

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/columns.tsx`

Add fields to track PO status:

```typescript
export type POItemRow = {
    // ... existing fields
    unitId: string | null;
    unit: string | null;
    vendorId: string | null;
    vendorName: string | null;
    estimatedPrice: number | null;
    expectedDelivery: Date | null;
    status: string;
    
    // ADD THESE:
    hasPO: boolean;              // Whether item has a PO
    poNumber?: string;           // PO number if exists
    poStatus?: string;           // PO status if exists
};
```

### Step 4: Update Data Flattening

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/client.tsx`

Update the flattened data to include PO information:

```typescript
const flattenedData = useMemo<POItemRow[]>(() => {
    return data.flatMap((indent) =>
        indent.items.map((item) => {
            // Check if item has any PO items
            const hasPO = item.purchaseOrderItems && item.purchaseOrderItems.length > 0;
            const firstPO = hasPO ? item.purchaseOrderItems[0] : null;
            
            return {
                id: item.id,
                indentId: indent.id,
                indentKey: indent.key,
                indentName: indent.name,
                materialId: item.material.id,
                materialName: item.material.name,
                projectName: indent.project.name,
                taskName: indent.task?.name || null,
                assigneeName: indent.assignee?.name || null,
                assigneeImage: indent.assignee?.image || null,
                quantity: item.quantity,
                unitId: item.unit?.id || null,
                unit: item.unit?.abbreviation || null,
                vendorId: item.vendor?.id || null,
                vendorName: item.vendor?.name || null,
                estimatedPrice: item.estimatedPrice || null,
                expectedDelivery: indent.expectedDelivery,
                status: item.status,
                
                // ADD THESE:
                hasPO: hasPO,
                poNumber: firstPO?.purchaseOrder?.poNumber,
                poStatus: firstPO?.purchaseOrder?.status,
            };
        })
    );
}, [data]);
```

### Step 5: Disable Row Selection for PO Items

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/client.tsx`

Add `enableRowSelection` to DataTable:

```typescript
<DataTable
    columns={columns}
    data={flattenedData}
    rowSelection={rowSelection}
    onRowSelectionChange={setRowSelection}
    // ADD THIS:
    enableRowSelection={(row) => !row.original.hasPO}  // Disable if has PO
    // ... other props
/>
```

### Step 6: Add Visual Indication in Columns

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/columns.tsx`

Update the Material column to show PO badge:

```typescript
{
    accessorKey: 'materialName',
    header: 'Material',
    cell: ({ row }) => {
        const hasPO = row.original.hasPO;
        const poNumber = row.original.poNumber;
        
        return (
            <div className="flex items-center gap-2">
                <div>
                    <div className="font-medium">{row.original.materialName}</div>
                    <div className="text-xs text-muted-foreground">{row.original.indentKey}</div>
                </div>
                {hasPO && (
                    <Badge variant="secondary" className="text-xs">
                        PO: {poNumber}
                    </Badge>
                )}
            </div>
        );
    },
},
```

### Step 7: Style Disabled Rows

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/client.tsx`

Add row styling:

```typescript
<DataTable
    // ... other props
    getRowClassName={(row) => 
        row.original.hasPO ? 'opacity-50 cursor-not-allowed' : ''
    }
/>
```

## Visual Result

### Before PO Creation:
```
☐ Cement - 100 bags - ABC Suppliers - ₹500 - APPROVED
☐ Steel Rods - 50 tons - ABC Suppliers - ₹800 - APPROVED
```

### After PO Creation:
```
☑ Cement - 100 bags - ABC Suppliers - ₹500 - APPROVED [PO: WT/2025-2026/000001]  ← Grayed out, can't select
☐ Steel Rods - 50 tons - ABC Suppliers - ₹800 - APPROVED
```

## Alternative: Add Status Column

Instead of disabling, you can add a "PO Status" column:

```typescript
{
    accessorKey: 'poNumber',
    header: 'PO Status',
    cell: ({ row }) => {
        if (row.original.hasPO) {
            return (
                <div className="flex items-center gap-2">
                    <Badge variant="success">
                        {row.original.poNumber}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                        {row.original.poStatus}
                    </span>
                </div>
            );
        }
        return <span className="text-muted-foreground">-</span>;
    },
},
```

## Testing

1. **Create a PO** for some indent items
2. **Refresh the PO page**
3. **Verify**:
   - Items used in PO are grayed out
   - Checkboxes are disabled for those items
   - Badge shows PO number
   - Can't select them for another PO

## Database Query to Check

```sql
-- Check which indent items have POs
SELECT 
    ii.id,
    m.name as material_name,
    COUNT(poi.id) as po_count,
    STRING_AGG(po.po_number, ', ') as po_numbers
FROM indent_item ii
LEFT JOIN purchase_order_item poi ON poi.indent_item_id = ii.id
LEFT JOIN purchase_order po ON po.id = poi.purchase_order_id
LEFT JOIN material m ON m.id = ii.material_id
GROUP BY ii.id, m.name
HAVING COUNT(poi.id) > 0;
```

## Summary

✅ **What This Does:**
- Prevents duplicate POs for same indent items
- Shows which items already have POs
- Disables selection for items with POs
- Displays PO number as a badge

✅ **User Experience:**
- Clear visual indication
- Can't accidentally create duplicate POs
- Can see PO number directly in the list

✅ **Data Integrity:**
- One indent item → One PO item
- Prevents data inconsistencies
- Maintains audit trail

## Next Steps

1. Run database migration
2. Update data fetching
3. Update types
4. Add visual indicators
5. Test thoroughly

🎯 This ensures indent items can only be used once for PO creation!
