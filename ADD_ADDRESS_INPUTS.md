# Add Address Input Fields

To match the Server Schema, you need to add input fields for **City, State, Country, and Pincode** in your Dialog.

## 1. Add Inputs

Place this code right after the "Delivery Address" Textarea (around line 310):

```tsx
                            {/* Detailed Address Fields */}
                            <div className="space-y-2">
                                <Label htmlFor="deliveryAddressLine2">Address Line 2</Label>
                                <Input
                                    id="deliveryAddressLine2"
                                    placeholder="Apartment, suite, etc."
                                    {...form.register('deliveryAddressLine2')}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 col-span-2">
                                <div className="space-y-2">
                                    <Label htmlFor="deliveryCity">City *</Label>
                                    <Input id="deliveryCity" {...form.register('deliveryCity')} />
                                    {form.formState.errors.deliveryCity && (
                                        <p className="text-sm text-destructive">{form.formState.errors.deliveryCity.message}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="deliveryState">State *</Label>
                                    <Input id="deliveryState" {...form.register('deliveryState')} />
                                    {form.formState.errors.deliveryState && (
                                        <p className="text-sm text-destructive">{form.formState.errors.deliveryState.message}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="deliveryCountry">Country *</Label>
                                    <Input id="deliveryCountry" {...form.register('deliveryCountry')} />
                                    {form.formState.errors.deliveryCountry && (
                                        <p className="text-sm text-destructive">{form.formState.errors.deliveryCountry.message}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="deliveryPincode">Pincode</Label>
                                    <Input id="deliveryPincode" {...form.register('deliveryPincode')} />
                                    {form.formState.errors.deliveryPincode && (
                                        <p className="text-sm text-destructive">{form.formState.errors.deliveryPincode.message}</p>
                                    )}
                                </div>
                            </div>
```

## 2. Ensure `onSubmit` Includes These

Make sure your `onSubmit` function passes these new fields:

```typescript
const result = await createPurchaseOrder(workspaceId, {
    // ...
    deliveryAddress: data.deliveryAddress,
    deliveryAddressLine2: data.deliveryAddressLine2,
    deliveryCity: data.deliveryCity,
    deliveryState: data.deliveryState,
    deliveryCountry: data.deliveryCountry,
    deliveryPincode: data.deliveryPincode,
    // ...
});
```

✅ This completes the address form!
