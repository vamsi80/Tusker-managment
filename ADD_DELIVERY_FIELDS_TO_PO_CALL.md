# Fix: Add Delivery Fields to createPurchaseOrder Call

## Problem

The `createPurchaseOrder` call is missing the new delivery fields.

## Solution

In **`src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`** around **line 163-175**:

### Change This:

```typescript
const result = await createPurchaseOrder(workspaceId, {
    vendorId: data.vendorId,
    projectId: data.projectId,
    items: data.items.map(item => ({
        materialId: item.materialId,
        unitId: item.unitId,
        orderedQuantity: item.orderedQuantity,
        unitPrice: item.unitPrice,
        sgstPercent: item.sgstPercent,
        cgstPercent: item.cgstPercent,
        indentItemId: item.indentItemId,
    })),
});
```

### To This:

```typescript
const result = await createPurchaseOrder(workspaceId, {
    vendorId: data.vendorId,
    projectId: data.projectId,
    deliveryAddress: data.deliveryAddress,        // ← ADD THIS
    deliveryTimeline: data.deliveryTimeline,      // ← ADD THIS
    termsAndConditions: data.termsAndConditions,  // ← ADD THIS (optional)
    items: data.items.map(item => ({
        materialId: item.materialId,
        unitId: item.unitId,
        orderedQuantity: item.orderedQuantity,
        unitPrice: item.unitPrice,
        sgstPercent: item.sgstPercent,
        cgstPercent: item.cgstPercent,
        indentItemId: item.indentItemId,
    })),
});
```

## What to Add

Just add these 3 lines after `projectId`:

```typescript
deliveryAddress: data.deliveryAddress,
deliveryTimeline: data.deliveryTimeline,
termsAndConditions: data.termsAndConditions,
```

✅ This will fix the TypeScript error!
