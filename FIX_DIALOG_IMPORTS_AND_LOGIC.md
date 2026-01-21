# Fix: Standardize Dialog Imports and Logic

## 1. Fix Imports & Form Definition

In **`src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`**:

Update the imports (around line 16) and the `useForm` call (around line 83):

```typescript
// Imports
import { createPOSchema, type CreatePOInput } from '@/lib/zodSchemas';
// Remove createPOFormSchema import if unused, or keep it as alias

// ...

export function CreatePODialog(...) {
    // ...
    
    // Form Definition
    const form = useForm<CreatePOInput>({
        resolver: zodResolver(createPOSchema),
        defaultValues: {
            vendorId: commonVendor?.id || '',
            projectId: commonProject?.id || '',
            deliveryAddress: '',
            deliveryAddressLine2: '', // Add new fields defaults
            deliveryCity: '',
            deliveryState: '',
            deliveryCountry: '',
            deliveryPincode: '',
            // deliveryDate is a Date, initialized as undefined or new Date() if needed, 
            // but react-hook-form handles standard inputs well if managed.
            // For Date Picker, better to leave undefined initially or set logic.
            
            termsAndConditions: '',
            items: selectedItems.map(item => ({
                // ... same item mapping ...
            })),
        },
    });
```

## 2. Fix `onSubmit` Logic (Critical)

Update the `onSubmit` function to match the schema field names and pass the items correctly:

```typescript
    async function onSubmit(data: CreatePOInput) { // Use CreatePOInput type
        // ... validations ...

        startTransition(async () => {
            const result = await createPurchaseOrder(workspaceId, {
                vendorId: data.vendorId,
                projectId: data.projectId,
                
                // Address (Note: 'deliveryAddress' not 'Line1')
                deliveryAddress: data.deliveryAddress,
                deliveryAddressLine2: data.deliveryAddressLine2,
                deliveryCity: data.deliveryCity,
                deliveryState: data.deliveryState,
                deliveryCountry: data.deliveryCountry,
                deliveryPincode: data.deliveryPincode,
                
                // Date
                deliveryDate: data.deliveryDate,
                
                termsAndConditions: data.termsAndConditions,
                
                // Items (Pass directly as they match the schema)
                items: data.items, 
            });

            if (result.success) {
                toast.success('Purchase Order created successfully');
                // ...
            }
            // ...
        });
    }
```

✅ This standardizes everything to use `createPOSchema` and `CreatePOInput`!
