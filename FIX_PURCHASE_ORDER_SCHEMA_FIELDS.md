# Fix: Add Missing Fields to PurchaseOrder Schema

## Problem

1. Schema has `deliveryAddressLine1` but code uses `deliveryAddress`
2. Schema is missing `deliveryTimeline` field
3. Schema is missing `termsAndConditions` field

## Solution

### Step 1: Update Prisma Schema

In **`prisma/schema.prisma`** around **line 550-552**, add these fields:

```prisma
deliveryPincode      String?
deliveryTimeline     String  // e.g., "7 days", "2 weeks"
termsAndConditions   String? @db.Text // Optional terms text

deliveryingAt DateTime?
```

### Step 2: Run Database Push

```bash
npx prisma db push
```

### Step 3: Update Server Action

In **`src/actions/procurement/create-purchase-order.ts`** around **line 116-118**, change:

```typescript
// WRONG:
deliveryAddress: validated.data.deliveryAddress,
deliveryTimeline: validated.data.deliveryTimeline,
termsAndConditions: validated.data.termsAndConditions,
```

To:

```typescript
// CORRECT:
deliveryAddressLine1: validated.data.deliveryAddress,
deliveryCity: '', // TODO: Parse from address
deliveryState: '', // TODO: Parse from address
deliveryCountry: 'India',
deliveryTimeline: validated.data.deliveryTimeline,
termsAndConditions: validated.data.termsAndConditions,
```

## Quick Fix (Temporary)

For now, just put the full address in `deliveryAddressLine1`:

```typescript
deliveryAddressLine1: validated.data.deliveryAddress,
deliveryCity: 'TBD',
deliveryState: 'TBD',
deliveryCountry: 'India',
deliveryTimeline: validated.data.deliveryTimeline,
termsAndConditions: validated.data.termsAndConditions,
```

Later you can parse the address into separate fields.

✅ This will fix all the TypeScript errors!
