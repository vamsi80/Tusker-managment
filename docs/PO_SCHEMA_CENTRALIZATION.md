# PO Schema Centralization - Complete ✅

## What Was Done

Successfully moved all Purchase Order Zod schemas from the local component file to the centralized `src/lib/zodSchemas.ts` file.

## Changes Made

### 1. Added to `src/lib/zodSchemas.ts`

Added three new schemas for Purchase Order creation:

```typescript
// Purchase Order Schemas
export const createPOItemSchema = z.object({
    materialId: z.string().min(1, "Material is required"),
    materialName: z.string(),
    unitId: z.string().min(1, "Unit is required"),
    unitName: z.string(),
    orderedQuantity: z.number().positive("Quantity must be greater than 0"),
    unitPrice: z.number().nonnegative("Price must be 0 or greater"),
    sgstPercent: z.number().min(0).max(100).optional(),
    cgstPercent: z.number().min(0).max(100).optional(),
    indentItemId: z.string().optional(),
});

export const createPOFormSchema = z.object({
    vendorId: z.string().min(1, 'Vendor is required'),
    projectId: z.string().min(1, 'Project is required'),
    items: z.array(createPOItemSchema).min(1, "At least one item is required"),
});

export const createPOSchema = z.object({
    workspaceId: z.string().uuid("Invalid workspace ID"),
    vendorId: z.string().uuid("Invalid vendor ID"),
    projectId: z.string().uuid("Invalid project ID"),
    items: z.array(createPOItemSchema).min(1, "At least one item is required"),
});
```

Added corresponding TypeScript types:

```typescript
export type CreatePOItemInput = z.infer<typeof createPOItemSchema>;
export type CreatePOFormData = z.infer<typeof createPOFormSchema>;
export type CreatePOInput = z.infer<typeof createPOSchema>;
```

### 2. Updated `create-po-dialog.tsx`

**Before:**
```typescript
import { z } from 'zod';

const createPOFormSchema = z.object({
    // ... schema definition
});

type CreatePOFormData = z.infer<typeof createPOFormSchema>;
```

**After:**
```typescript
import { createPOFormSchema, type CreatePOFormData } from '@/lib/zodSchemas';
```

## Benefits

✅ **Centralized Validation**: All Zod schemas in one place
✅ **Reusability**: Can import schemas anywhere in the app
✅ **Type Safety**: TypeScript types exported alongside schemas
✅ **Consistency**: Follows the same pattern as other schemas (indent, material, vendor, etc.)
✅ **Maintainability**: Easier to update validation rules

## Schema Hierarchy

```
zodSchemas.ts
├── createPOItemSchema      (Individual PO item validation)
├── createPOFormSchema      (Form-level validation for dialog)
└── createPOSchema          (Server action validation with workspaceId)
```

## Usage Examples

### In Components (Form Validation)
```typescript
import { createPOFormSchema, type CreatePOFormData } from '@/lib/zodSchemas';

const form = useForm<CreatePOFormData>({
    resolver: zodResolver(createPOFormSchema),
    defaultValues: { ... }
});
```

### In Server Actions (Data Validation)
```typescript
import { createPOSchema, type CreatePOInput } from '@/lib/zodSchemas';

export async function createPurchaseOrder(input: CreatePOInput) {
    const validated = createPOSchema.parse(input);
    // ... create PO
}
```

### In API Routes
```typescript
import { createPOSchema } from '@/lib/zodSchemas';

export async function POST(request: Request) {
    const body = await request.json();
    const validated = createPOSchema.parse(body);
    // ... process request
}
```

## Files Modified

1. **`src/lib/zodSchemas.ts`** - Added PO schemas and types
2. **`src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`** - Updated imports

## Related Schemas in zodSchemas.ts

The PO schemas follow the same pattern as existing schemas:

- `indentSchema` → `createPOSchema`
- `materialItemSchema` → `createPOItemSchema`
- `createIndentRequestSchema` → `createPOFormSchema`

## Testing

After these changes, verify:

1. ✅ Create PO dialog still works
2. ✅ Form validation works correctly
3. ✅ TypeScript types are correct
4. ✅ No import errors
5. ✅ Server action validation works

## Next Steps

If you need to add more PO-related schemas (e.g., for editing, deleting, or updating POs), add them to `zodSchemas.ts` following the same pattern:

```typescript
export const updatePOSchema = z.object({
    poId: z.string().uuid(),
    // ... other fields
});

export type UpdatePOInput = z.infer<typeof updatePOSchema>;
```

✅ **Schema centralization complete!** All PO validation logic is now in one place.
