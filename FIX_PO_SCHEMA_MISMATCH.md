# Fix: PO Schema Type Mismatch

## Problem

The `createPOSchema` expects items WITHOUT `materialName` and `unitName` (server action), but `createPOItemSchema` includes them (form display).

## Solution

Update `src/lib/zodSchemas.ts` around line 454-463:

### Replace This:

```typescript
export const createPOSchema = z.object({
    workspaceId: z.string()
        .uuid("Invalid workspace ID"),
    vendorId: z.string()
        .uuid("Invalid vendor ID"),
    projectId: z.string()
        .uuid("Invalid project ID"),
    items: z.array(createPOItemSchema)
        .min(1, { message: "At least one item is required" }),
});
```

### With This:

```typescript
// Server action item schema - strips display-only fields
export const createPOServerItemSchema = createPOItemSchema.omit({ 
    materialName: true, 
    unitName: true 
});

export const createPOSchema = z.object({
    workspaceId: z.string()
        .uuid("Invalid workspace ID"),
    vendorId: z.string()
        .uuid("Invalid vendor ID"),
    projectId: z.string()
        .uuid("Invalid project ID"),
    deliveryAddress: z.string()
        .min(1, { message: "Delivery address is required" }),
    deliveryTimeline: z.string()
        .min(1, { message: "Delivery timeline is required" }),
    termsAndConditions: z.string().optional(),
    items: z.array(createPOServerItemSchema)
        .min(1, { message: "At least one item is required" }),
});
```

## Explanation

- **`createPOItemSchema`**: Used in FORM - includes `materialName` and `unitName` for display
- **`createPOServerItemSchema`**: Used in SERVER ACTION - omits display fields
- **`createPOSchema`**: Server validation - uses `createPOServerItemSchema`

This way:
- Form can have display fields
- Server action doesn't require them
- No type mismatch!

✅ This will fix the TypeScript error!
