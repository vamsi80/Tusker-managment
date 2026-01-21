# Purchase Order Creation with GST - Implementation Guide

## Overview

This guide shows how to integrate the Purchase Order creation feature with SGST/CGST tax calculations into your existing PO page.

## Changes Made

### 1. Database Schema Updates

**File**: `prisma/schema.prisma`

Added tax fields to `PurchaseOrderItem`:
```prisma
// Tax details (Indian GST)
sgstPercent Decimal? @db.Decimal(5, 2) // SGST percentage (e.g., 9.00 for 9%)
cgstPercent Decimal? @db.Decimal(5, 2) // CGST percentage (e.g., 9.00 for 9%)

// Calculated totals
lineTotal   Decimal @db.Decimal(15, 2) // Subtotal: orderedQuantity * unitPrice (before tax)
taxAmount   Decimal @db.Decimal(15, 2) @default(0) // Total tax
totalAmount Decimal @db.Decimal(15, 2) // Final total: lineTotal + taxAmount
```

Added tax breakdown to `PurchaseOrder`:
```prisma
subtotalAmount Decimal @db.Decimal(15, 2) @default(0) // Sum of all line totals (before tax)
totalTaxAmount Decimal @db.Decimal(15, 2) @default(0) // Sum of all tax amounts
totalAmount    Decimal @db.Decimal(15, 2) // Grand total (subtotal + tax)
```

### 2. Server Action Created

**File**: `src/actions/procurement/create-purchase-order.ts`

Key features:
- Validates user permissions using `getUserPermissions`
- Verifies vendor and project belong to workspace
- Auto-generates PO number (format: `PO-YYYY-NNNN`)
- Calculates tax for each line item
- Creates PO with all items in a transaction
- Revalidates cache paths

### 3. Create PO Dialog Component

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`

Features:
- Real-time tax calculation as user edits
- Validates all items have same vendor
- Shows subtotal, tax, and grand total
- Editable quantity, unit price, SGST%, CGST%
- Remove items functionality
- Responsive table layout

## Integration Steps

### Step 1: Run Database Migration

```bash
# Generate and apply migration
pnpm prisma migrate dev --name add_po_gst_fields

# Regenerate Prisma Client
pnpm prisma generate
```

### Step 2: Update Client Component

**File**: `src/app/w/[workspaceId]/procurement/po/_componets/client.tsx`

Add state for Create PO Dialog (around line 44):
```typescript
const [createPODialogOpen, setCreatePODialogOpen] = useState(false);
```

Update the Create PO button onClick (around line 188):
```typescript
<Button
    disabled={selectedCount === 0}
    onClick={() => setCreatePODialogOpen(true)}
>
    <IconPlus className="mr-2 h-4 w-4" />
    Create PO {selectedCount > 0 && `(${selectedCount})`}
</Button>
```

Add the dialog before the closing `</div>` (around line 258):
```typescript
{/* Create PO Dialog */}
{createPODialogOpen && (
    <CreatePODialog
        open={createPODialogOpen}
        onOpenChange={setCreatePODialogOpen}
        selectedItems={flattenedData.filter((_, index) => rowSelection[index])}
        workspaceId={workspaceId}
        vendors={vendors}
        projects={projects}
        onSuccess={() => {
            setRowSelection({});
            setCreatePODialogOpen(false);
        }}
    />
)}
```

### Step 3: Fix Unit ID Issue

The Create PO Dialog needs unit IDs. Update the POItemRow type to include unitId, or fetch it from the materials data.

**Quick Fix** - Update the dialog to get unitId from materials:

In `create-po-dialog.tsx`, update the default values:
```typescript
defaultValues: {
    // ... other fields
    items: selectedItems.map(item => {
        // Find the material to get its default unit ID
        const material = materials.find(m => m.id === item.materialId);
        
        return {
            materialId: item.materialId,
            materialName: item.materialName,
            unitId: material?.defaultUnitId || '',
            unitName: item.unit || '',
            orderedQuantity: item.quantity,
            unitPrice: item.estimatedPrice || 0,
            sgstPercent: 9, // Default 9% SGST
            cgstPercent: 9, // Default 9% CGST
            indentItemId: item.id,
        };
    }),
},
```

And pass materials to the dialog:
```typescript
<CreatePODialog
    // ... other props
    materials={materials}  // Add this
/>
```

Update CreatePODialogProps interface:
```typescript
interface CreatePODialogProps {
    // ... existing props
    materials: { id: string; name: string; defaultUnitId: string | null }[];
}
```

## Tax Calculation Logic

### Line Item Calculation
```typescript
lineTotal = orderedQuantity × unitPrice
taxAmount = lineTotal × (sgstPercent + cgstPercent) / 100
totalAmount = lineTotal + taxAmount
```

### Example
```
Quantity: 100
Unit Price: ₹500
SGST: 9%
CGST: 9%

Line Total: 100 × 500 = ₹50,000
Tax Amount: 50,000 × (9 + 9) / 100 = ₹9,000
Total Amount: 50,000 + 9,000 = ₹59,000
```

### PO Totals
```typescript
subtotalAmount = SUM(all item.lineTotal)
totalTaxAmount = SUM(all item.taxAmount)
totalAmount = SUM(all item.totalAmount)
```

## Testing Checklist

- [ ] Select multiple items with same vendor
- [ ] Click "Create PO" button
- [ ] Dialog opens with all selected items
- [ ] Vendor is pre-selected (if all items have same vendor)
- [ ] Project is pre-selected (if all items have same project)
- [ ] Edit quantity - totals update
- [ ] Edit unit price - totals update
- [ ] Edit SGST% - totals update
- [ ] Edit CGST% - totals update
- [ ] Remove an item - totals update
- [ ] Try to create PO with items from different vendors - shows error
- [ ] Try to create PO with items without vendor - shows error
- [ ] Successfully create PO - redirects and shows success message
- [ ] Verify PO created in database with correct totals

## Common Issues & Solutions

### Issue: "purchaseOrder does not exist on PrismaClient"
**Solution**: Run `pnpm prisma generate` to regenerate the Prisma Client after schema changes.

### Issue: Unit ID is empty
**Solution**: Pass materials prop to dialog and use `material.defaultUnitId` as shown in Step 3.

### Issue: Tax calculation is wrong
**Solution**: Ensure SGST and CGST are stored as percentages (9.00 for 9%), not decimals (0.09).

### Issue: Multiple vendors error
**Solution**: The dialog validates this. Users must select items from the same vendor.

## UI Preview

```
┌─────────────────────────────────────────────────────────────────┐
│ Create Purchase Order                                           │
├─────────────────────────────────────────────────────────────────┤
│ Vendor: [ABC Suppliers ▼]    Project: [Project X ▼]            │
├─────────────────────────────────────────────────────────────────┤
│ Material    │ Qty │ Price │ SGST% │ CGST% │ Subtotal │ Tax │ Total │
├─────────────┼─────┼───────┼───────┼───────┼──────────┼─────┼───────┤
│ Cement      │ 100 │ 500   │ 9.00  │ 9.00  │ 50,000   │9,000│59,000 │
│ Steel Rods  │  50 │ 800   │ 9.00  │ 9.00  │ 40,000   │7,200│47,200 │
├─────────────┴─────┴───────┴───────┴───────┼──────────┼─────┼───────┤
│                                   TOTALS: │ 90,000   │16,200│106,200│
└───────────────────────────────────────────┴──────────┴─────┴───────┘
                                    [Cancel]  [Create Purchase Order]
```

## Next Steps

1. **Run Migration**: Apply schema changes
2. **Update Client**: Integrate Create PO Dialog
3. **Test**: Verify all functionality works
4. **Create PO List Page**: Show created POs
5. **Add PO Detail Page**: View/edit individual POs
6. **Add Approval Workflow**: Implement PO approval
7. **Add Payment Tracking**: Use the payment module designed earlier

## Related Documentation

- `docs/PURCHASE_ORDER_DESIGN.md` - Complete PO module design
- `docs/PAYMENT_TRACKING_DESIGN.md` - Payment tracking module
- `docs/PO_PAYMENT_SCHEMA_SUMMARY.md` - Schema overview

## Support

If you encounter issues:
1. Check Prisma Client is regenerated
2. Verify all imports are correct
3. Check browser console for errors
4. Review server logs for backend errors
