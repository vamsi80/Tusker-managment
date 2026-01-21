# Fix: Zod Schema Mismatch & Field Updates

## Problem

1. `createPOFormSchema` is commented out, causing errors in `create-po-dialog.tsx`.
2. `createPOSchema` expects `deliveryingAt` (date) but UI sends `deliveryTimeline` (string).
3. Server action needs to map fields correctly.

## Solution

### 1. Update `src/lib/zodSchemas.ts`

Replace the commented out `createPOFormSchema` and the `createPOSchema` with this corrected code:

```typescript
// Uncomment and update this:
export const createPOFormSchema = z.object({
    vendorId: z.string().min(1, { message: "Vendor is required" }),
    projectId: z.string().min(1, { message: "Project is required" }),
    deliveryAddress: z.string()
        .min(1, { message: "Delivery address is required" })
        .max(500, { message: "Delivery address must be at most 500 characters" }),
    deliveryTimeline: z.string() // Use String, not Date
        .min(1, { message: "Delivery timeline is required" })
        .max(100, { message: "Timeline must be at most 100 characters" }),
    termsAndConditions: z.string().optional(),
    items: z.array(createPOItemSchema).min(1, { message: "At least one item is required" }),
});

export const createPOServerItemSchema = createPOItemSchema.omit({
    materialName: true,
    unitName: true
});

export const createPOSchema = z.object({
    workspaceId: z.string().uuid("Invalid workspace ID"),
    vendorId: z.string().uuid("Invalid vendor ID"),
    projectId: z.string().uuid("Invalid project ID"),
    
    // Server expects these:
    deliveryAddressLine1: z.string().min(1, { message: "Delivery address is required" }),
    deliveryTimeline: z.string().min(1, { message: "Delivery timeline is required" }),
    termsAndConditions: z.string().optional(),
    
    items: z.array(createPOServerItemSchema).min(1, { message: "At least one item is required" }),
});
```

And update the type export at the bottom:
```typescript
export type CreatePOFormData = z.infer<typeof createPOFormSchema>; // Uncomment this
```

### 2. Update Server Action (`src/actions/procurement/create-purchase-order.ts`)

Update the database create call to match the schema:

```typescript
// Inside createPurchaseOrder function:

const result = await db.purchaseOrder.create({
    data: {
        // ... other fields
        deliveryAddressLine1: validated.data.deliveryAddressLine1,
        deliveryTimeline: validated.data.deliveryTimeline, // Use timeline string
        termsAndConditions: validated.data.termsAndConditions,
        
        // Remove or pass null for unused fields if needed:
        deliveryCity: 'TBD',
        deliveryState: 'TBD',
        deliveryCountry: 'India',
        
        items: {
            create: itemsWithTotals,
        },
    },
});
```

✅ This fixes the type mismatch and schema validation errors!
