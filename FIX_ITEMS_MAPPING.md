# Fix Item Mapping Error

The error happens because you are using `.map(...)` to create new item objects, but you forgot to include `materialName` and `unitName` in that mapping.

Since `data.items` already comes from the form (which matches the schema), you don't need to map it at all!

## Solution

In `src/app/w/[workspaceId]/procurement/po/_componets/create-po-dialog.tsx` inside the `onSubmit` function:

**Replace this block:**

```typescript
items: data.items.map(item => ({
    materialId: item.materialId,
    unitId: item.unitId,
    orderedQuantity: item.orderedQuantity,
    unitPrice: item.unitPrice,
    sgstPercent: item.sgstPercent,
    cgstPercent: item.cgstPercent,
    indentItemId: item.indentItemId,
})),
```

**With just this:**

```typescript
items: data.items,
```

✅ This passes the valid items (including names) directly to the server action!
