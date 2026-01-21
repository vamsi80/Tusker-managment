# PO Dialog - Delivery Details & Terms Added ✅

## New Fields Added to PO Creation

Successfully added three new fields to the Purchase Order creation dialog:

### 1. **Delivery Timeline** (Required)
- **Type**: Text input
- **Placeholder**: "e.g., 7 days, 2 weeks, 1 month"
- **Validation**: Required, max 100 characters
- **Purpose**: Specify when materials should be delivered
- **Helper Text**: "When should materials be delivered?"

### 2. **Delivery Address** (Required)
- **Type**: Textarea (3 rows)
- **Placeholder**: "Enter delivery address"
- **Validation**: Required, max 500 characters
- **Purpose**: Specify where materials should be delivered

### 3. **Terms & Conditions** (Optional)
- **Type**: Textarea (4 rows)
- **Placeholder**: "Enter any terms and conditions for this PO (optional)"
- **Validation**: Optional
- **Purpose**: Add payment terms, quality standards, penalties, etc.
- **Helper Text**: "Payment terms, quality standards, penalties, etc."

## Changes Made

### 1. Schema Updates (`zodSchemas.ts`)

```typescript
export const createPOFormSchema = z.object({
    vendorId: z.string().min(1, { message: "Vendor is required" }),
    projectId: z.string().min(1, { message: "Project is required" }),
    deliveryAddress: z.string()
        .min(1, { message: "Delivery address is required" })
        .max(500, { message: "Delivery address must be at most 500 characters" }),
    deliveryTimeline: z.string()
        .min(1, { message: "Delivery timeline is required" })
        .max(100, { message: "Delivery timeline must be at most 100 characters" }),
    termsAndConditions: z.string().optional(),
    items: z.array(createPOItemSchema).min(1, { message: "At least one item is required" }),
});
```

### 2. Dialog Component (`create-po-dialog.tsx`)

**Added Textarea Import:**
```typescript
import { Textarea } from '@/components/ui/textarea';
```

**Added Default Values:**
```typescript
defaultValues: {
    vendorId: commonVendor?.id || '',
    projectId: commonProject?.id || '',
    deliveryAddress: '',
    deliveryTimeline: '',
    termsAndConditions: '',
    items: [...],
}
```

**Added Form Section:**
```typescript
{/* Delivery Details Section */}
<div className="space-y-4 pt-4 border-t">
    <h3 className="font-semibold text-sm">Delivery Details</h3>
    
    <div className="grid grid-cols-2 gap-4">
        {/* Delivery Timeline */}
        <div className="space-y-2">
            <Label htmlFor="deliveryTimeline">Delivery Timeline *</Label>
            <Input
                id="deliveryTimeline"
                placeholder="e.g., 7 days, 2 weeks, 1 month"
                {...form.register('deliveryTimeline')}
            />
            {/* Error message */}
            <p className="text-xs text-muted-foreground">When should materials be delivered?</p>
        </div>

        {/* Delivery Address */}
        <div className="space-y-2">
            <Label htmlFor="deliveryAddress">Delivery Address *</Label>
            <Textarea
                id="deliveryAddress"
                placeholder="Enter delivery address"
                rows={3}
                {...form.register('deliveryAddress')}
            />
            {/* Error message */}
        </div>
    </div>

    {/* Terms and Conditions */}
    <div className="space-y-2">
        <Label htmlFor="termsAndConditions">Terms & Conditions</Label>
        <Textarea
            id="termsAndConditions"
            placeholder="Enter any terms and conditions for this PO (optional)"
            rows={4}
            {...form.register('termsAndConditions')}
        />
        <p className="text-xs text-muted-foreground">Payment terms, quality standards, penalties, etc.</p>
    </div>
</div>
```

## Form Layout

### Before:
```
┌─────────────────────────────────────────┐
│ PO Number  │ Vendor  │ Project  │ Date │
├─────────────────────────────────────────┤
│ Items Table                             │
│ Totals                                  │
└─────────────────────────────────────────┘
```

### After:
```
┌─────────────────────────────────────────┐
│ PO Number  │ Vendor  │ Project  │ Date │
├─────────────────────────────────────────┤
│ Delivery Details                        │
│ ├─ Delivery Timeline  │ Delivery Address│
│ └─ Terms & Conditions                   │
├─────────────────────────────────────────┤
│ Items Table                             │
│ Totals                                  │
└─────────────────────────────────────────┘
```

## Example Usage

### Delivery Timeline Examples:
- "7 days from PO date"
- "2 weeks"
- "Within 1 month"
- "15 working days"
- "By 31st January 2026"

### Delivery Address Example:
```
Site Office, Building A
Construction Site, Phase 2
Near City Mall, Main Road
Bangalore - 560001
```

### Terms & Conditions Example:
```
1. Payment: 50% advance, 50% on delivery
2. Quality: As per IS standards
3. Penalty: 1% per day for late delivery
4. Warranty: 1 year manufacturer warranty
5. Inspection: Materials subject to quality check
```

## Validation

### Required Fields:
- ✅ Delivery Timeline (must be filled)
- ✅ Delivery Address (must be filled)

### Optional Fields:
- ⭕ Terms & Conditions (can be left empty)

### Error Messages:
- "Delivery timeline is required"
- "Delivery address is required"
- "Delivery address must be at most 500 characters"
- "Delivery timeline must be at most 100 characters"

## Benefits

✅ **Complete PO Information**: All delivery details in one place
✅ **Clear Expectations**: Timeline and address specified upfront
✅ **Legal Protection**: Terms & conditions documented
✅ **Better Communication**: Vendor knows exactly what's expected
✅ **Audit Trail**: All details saved with PO

## Next Steps

### Database Migration Required:

You'll need to add these fields to the PurchaseOrder model:

```prisma
model PurchaseOrder {
  id                  String   @id @default(uuid())
  poNumber            String   @unique
  // ... existing fields
  deliveryAddress     String
  deliveryTimeline    String
  termsAndConditions  String?
  // ... other fields
}
```

### Server Action Update:

Update `createPurchaseOrder` action to save these fields:

```typescript
await db.purchaseOrder.create({
    data: {
        // ... existing fields
        deliveryAddress: input.deliveryAddress,
        deliveryTimeline: input.deliveryTimeline,
        termsAndConditions: input.termsAndConditions,
        // ... other fields
    }
});
```

## Files Modified

1. **`src/lib/zodSchemas.ts`** - Added fields to schema
2. **`src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`** - Added form fields

## Testing Checklist

- [ ] Delivery Timeline field shows and validates
- [ ] Delivery Address field shows and validates
- [ ] Terms & Conditions field shows (optional)
- [ ] Required field validation works
- [ ] Character limit validation works
- [ ] Form submits with all data
- [ ] Data is saved to database
- [ ] PO displays delivery details

✅ **PO Dialog now includes complete delivery details and terms!** 🎯
