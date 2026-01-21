# Fix: Add Missing Address Fields to UI & Server

## 1. Update Server Action (`create-purchase-order.ts`)

In **`src/actions/procurement/create-purchase-order.ts`**, update the mapping to include all address fields:

```typescript
data: {
    // ...
    deliveryAddressLine1: validated.data.deliveryAddress,
    deliveryAddressLine2: validated.data.deliveryAddressLine2,
    deliveryCity: validated.data.deliveryCity,
    deliveryState: validated.data.deliveryState,
    deliveryCountry: validated.data.deliveryCountry,
    deliveryPincode: validated.data.deliveryPincode,
    deliveryingAt: validated.data.deliveryDate,
    termsAndConditions: validated.data.termsAndConditions,
    // ...
},
```

## 2. Update UI (`create-po-dialog.tsx`)

In **`src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`**:

### A. Add Input Fields

Add form fields for **City, State, Country, and Pincode** (Line 2 is optional).

```tsx
// Example for City (Repeat for State, Country, Pincode)
<FormField
    control={form.control}
    name="deliveryCity"
    render={({ field }) => (
        <FormItem>
            <FormLabel>City *</FormLabel>
            <FormControl>
                <Input placeholder="City" {...field} />
            </FormControl>
            <FormMessage />
        </FormItem>
    )}
/>
// ... Do the same for deliveryState, deliveryCountry, deliveryPincode
```

### B. Update `onSubmit`

Update the object sent to the server action to include these fields:

```typescript
const result = await createPurchaseOrder(workspaceId, {
    vendorId: data.vendorId,
    projectId: data.projectId,
    
    deliveryAddress: data.deliveryAddress,
    deliveryAddressLine2: data.deliveryAddressLine2,
    deliveryCity: data.deliveryCity,
    deliveryState: data.deliveryState,
    deliveryCountry: data.deliveryCountry,
    deliveryPincode: data.deliveryPincode,
    
    deliveryDate: data.deliveryDate,
    termsAndConditions: data.termsAndConditions,
    items: data.items,
});
```

✅ This resolves the missing fields error!
