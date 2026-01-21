# Fix Errors in `create-po-dialog.tsx`

You have 3 errors in your `createPurchaseOrder` call:

1.  **Wrong Address Key**: You used `deliveryAddressLine1`, but the schema expects `deliveryAddress`.
2.  **Missing Date**: You forgot to pass `deliveryDate: data.deliveryDate`.
3.  **Broken Items**: Your `.map(...)` removes `materialName` and `unitName`, which are required.

## Correct Code

Replace the relevant block inside `onSubmit` (lines 163-182) with this:

```typescript
            const result = await createPurchaseOrder(workspaceId, {
                vendorId: data.vendorId,
                projectId: data.projectId,
                deliveryAddress: data.deliveryAddress, // Changed from deliveryAddressLine1
                deliveryAddressLine2: data.deliveryAddressLine2,
                deliveryCity: data.deliveryCity,
                deliveryState: data.deliveryState,
                deliveryCountry: data.deliveryCountry,
                deliveryPincode: data.deliveryPincode,
                deliveryDate: data.deliveryDate,       // Added missing field
                termsAndConditions: data.termsAndConditions,
                items: data.items,                     // Passed directly (includes names)
            });
```

✅ This matches the Schema exactly!
