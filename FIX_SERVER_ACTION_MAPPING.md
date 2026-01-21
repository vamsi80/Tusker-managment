# Fix: Update Server Action & UI for Unified Schema

## 1. Update Server Action (`create-purchase-order.ts`)

In **`src/actions/procurement/create-purchase-order.ts`**, update the mapping in the `db.purchaseOrder.create` call:

```typescript
data: {
    // ...
    createdById: permissions.workspaceMember.userId,
    
    // START CHANGES
    deliveryAddressLine1: validated.data.deliveryAddress, // Map 'deliveryAddress' -> 'Line1'
    deliveryingAt: validated.data.deliveryDate,           // Map 'deliveryDate' -> 'deliveryingAt'
    termsAndConditions: validated.data.termsAndConditions,
    // END CHANGES

    items: {
        create: itemsWithTotals,
    },
},
```

## 2. Update UI (`create-po-dialog.tsx`)

In **`src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`**:

1.  **Import**: Ensure you import `createPOSchema` (or use the `createPOFormSchema` alias).
2.  **Date Picker**: Ensure you are using a Date Picker for `deliveryDate`.
3.  **OnSubmit**:

```typescript
const result = await createPurchaseOrder(workspaceId, {
    vendorId: data.vendorId,
    projectId: data.projectId,
    deliveryAddress: data.deliveryAddress,
    deliveryDate: data.deliveryDate,
    termsAndConditions: data.termsAndConditions,
    items: data.items,
});
```

✅ This ensures everything works with the simplified single schema!
