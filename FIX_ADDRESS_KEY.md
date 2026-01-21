# Fix: Wrong Address Key

You are getting an error because you are using `deliveryAddressLine1` but the updated schema expects `deliveryAddress`.

## Solution

In **`create-po-dialog.tsx`** (around line 165), rename the property:

**Change this:**
```typescript
deliveryAddressLine1: data.deliveryAddress,
```

**To this:**
```typescript
deliveryAddress: data.deliveryAddress,
```

✅ This matches the updated `createPOSchema`!
