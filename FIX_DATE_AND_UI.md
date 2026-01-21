# Fix: Switch Delivery Timeline to Date

## Problem

We switched from a String "Timeline" to a Date "Delivery Date" in the schema, so we need to update the UI and Server Action to match.

## 1. Update Server Action

In **`src/actions/procurement/create-purchase-order.ts`** around **line 116**:

Add `deliveryingAt`:

```typescript
data: {
    // ...
    createdById: permissions.workspaceMember.userId,
    deliveryingAt: validated.data.deliveryDate, // ← Add this line
    deliveryAddressLine1: validated.data.deliveryAddressLine1,
    termsAndConditions: validated.data.termsAndConditions,
    // ...
},
```

## 2. Update React Dialog (`create-po-dialog.tsx`)

In **`src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx`**:

### A. Update Form Field

Find the `deliveryTimeline` field and replace it with a **Date Picker** or Date Input.

If using **shadcn/ui DatePicker**:

```tsx
<FormField
    control={form.control}
    name="deliveryDate" // Changed from deliveryTimeline
    render={({ field }) => (
        <FormItem className="flex flex-col">
            <FormLabel>Expected Delivery</FormLabel>
            <Popover>
                <PopoverTrigger asChild>
                    <FormControl>
                        <Button
                            variant={"outline"}
                            className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                            )}
                        >
                            {field.value ? (
                                format(field.value, "PPP")
                            ) : (
                                <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                    </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                            date < new Date()
                        }
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
            <FormMessage />
        </FormItem>
    )}
/>
```

### B. Update `onSubmit`

Update the data sent to the server action:

```typescript
const result = await createPurchaseOrder(workspaceId, {
    vendorId: data.vendorId,
    projectId: data.projectId,
    deliveryAddressLine1: data.deliveryAddress, // Map address
    deliveryDate: data.deliveryDate,            // Map date
    termsAndConditions: data.termsAndConditions,
    items: // ...
});
```

✅ This completes the switch to using a Date field!
