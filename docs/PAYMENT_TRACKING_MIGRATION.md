# Payment Tracking Module - Migration Guide

## Overview

This guide walks you through adding the Payment Tracking module to your existing Purchase Order system.

## Prerequisites

- Existing PurchaseOrder and PurchaseOrderItem models in your schema
- PostgreSQL database
- Prisma CLI installed
- PO module already deployed and working

---

## Step 1: Verify Current Schema

Ensure your `prisma/schema.prisma` includes:

✅ `PurchaseOrder` model  
✅ `PurchaseOrderItem` model  
✅ `POStatus` enum  
✅ User, Workspace, Vendor models  

---

## Step 2: Review Schema Changes

The following have been added to your schema:

### New Model: PurchaseOrderPayment

```prisma
model PurchaseOrderPayment {
  id              String   @id @default(uuid())
  purchaseOrderId String
  amountPaid      Decimal  @db.Decimal(15, 2)
  paymentDate     DateTime
  remarks         String?
  workspaceId     String
  recordedById    String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  purchaseOrder PurchaseOrder @relation(...)
  recordedBy    User          @relation("PaymentRecorder", ...)
  
  @@index([purchaseOrderId])
  @@index([workspaceId])
  @@index([recordedById])
  @@index([paymentDate])
  @@index([purchaseOrderId, paymentDate])
  @@map("purchase_order_payment")
}
```

### New Enum: PaymentStatus

```prisma
enum PaymentStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
  OVERPAID
}
```

### Updated Relations

**PurchaseOrder model:**
```prisma
model PurchaseOrder {
  // ... existing fields
  payments PurchaseOrderPayment[] // NEW
}
```

**User model:**
```prisma
model User {
  // ... existing fields
  recordedPayments PurchaseOrderPayment[] @relation("PaymentRecorder") // NEW
}
```

---

## Step 3: Generate and Apply Migration

### 3.1 Generate Migration

```bash
pnpm prisma migrate dev --name add_payment_tracking
```

This will:
1. Create migration file in `prisma/migrations/`
2. Apply changes to database
3. Regenerate Prisma Client

### 3.2 Verify Migration

Check migration was successful:

```bash
pnpm prisma migrate status
```

Expected output:
```
Database schema is up to date!
```

### 3.3 Inspect Database

Connect to PostgreSQL and verify:

```sql
-- Check table exists
\d purchase_order_payment

-- Check columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'purchase_order_payment';

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'purchase_order_payment';

-- Check enum
SELECT enum_range(NULL::PaymentStatus);
```

---

## Step 4: Verify Schema

### Expected Table Structure

**purchase_order_payment:**

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| purchaseOrderId | uuid | NO | - |
| amountPaid | decimal(15,2) | NO | - |
| paymentDate | timestamp | NO | - |
| remarks | text | YES | NULL |
| workspaceId | uuid | NO | - |
| recordedById | text | NO | - |
| createdAt | timestamp | NO | now() |
| updatedAt | timestamp | NO | now() |

### Expected Indexes

- `purchase_order_payment_pkey` (id)
- `purchase_order_payment_purchaseOrderId_idx`
- `purchase_order_payment_workspaceId_idx`
- `purchase_order_payment_recordedById_idx`
- `purchase_order_payment_paymentDate_idx`
- `purchase_order_payment_purchaseOrderId_paymentDate_idx`

### Expected Foreign Keys

- `purchaseOrderId` → `purchase_order.id` (CASCADE)
- `recordedById` → `user.id`

---

## Step 5: Regenerate Prisma Client

Ensure TypeScript types are updated:

```bash
pnpm prisma generate
```

Verify in your code:

```typescript
import { PrismaClient, PaymentStatus } from '@/generated/prisma';

const db = new PrismaClient();

// Test types are available
const payment = await db.purchaseOrderPayment.findFirst();
const status: PaymentStatus = 'UNPAID';
```

---

## Step 6: Create Helper Functions

### 6.1 Payment Status Calculator

Create `src/lib/payment-utils.ts`:

```typescript
import { Decimal } from '@prisma/client/runtime/library';

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID';

export function calculatePaymentStatus(
  totalAmount: number | Decimal,
  totalPaid: number | Decimal
): PaymentStatus {
  const total = Number(totalAmount);
  const paid = Number(totalPaid);

  if (paid === 0) return 'UNPAID';
  if (paid < total) return 'PARTIALLY_PAID';
  if (paid === total) return 'PAID';
  return 'OVERPAID';
}

export function calculateRemainingAmount(
  totalAmount: number | Decimal,
  totalPaid: number | Decimal
): number {
  return Math.max(0, Number(totalAmount) - Number(totalPaid));
}

export function formatPaymentStatus(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    UNPAID: 'Unpaid',
    PARTIALLY_PAID: 'Partially Paid',
    PAID: 'Paid',
    OVERPAID: 'Overpaid'
  };
  return labels[status];
}
```

### 6.2 Data Access Functions

Create `src/data/procurement/payments.ts`:

```typescript
import { db } from '@/lib/db';
import { calculatePaymentStatus } from '@/lib/payment-utils';

export async function getPOPaymentStatus(purchaseOrderId: string) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      payments: {
        select: { amountPaid: true }
      }
    }
  });

  if (!po) return null;

  const totalPaid = po.payments.reduce(
    (sum, p) => sum + Number(p.amountPaid),
    0
  );

  return {
    totalAmount: Number(po.totalAmount),
    totalPaid,
    remainingAmount: Number(po.totalAmount) - totalPaid,
    paymentStatus: calculatePaymentStatus(po.totalAmount, totalPaid),
    paymentCount: po.payments.length
  };
}

export async function getPaymentHistory(
  purchaseOrderId: string,
  workspaceId: string
) {
  return await db.purchaseOrderPayment.findMany({
    where: {
      purchaseOrderId,
      workspaceId
    },
    include: {
      recordedBy: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: { paymentDate: 'desc' }
  });
}
```

---

## Step 7: Create Server Actions

Create `src/actions/procurement/record-payment.ts`:

```typescript
'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const recordPaymentSchema = z.object({
  amountPaid: z.number().positive('Amount must be greater than 0'),
  paymentDate: z.date().max(new Date(), 'Payment date cannot be in future'),
  remarks: z.string().optional()
});

export async function recordPayment(
  workspaceId: string,
  purchaseOrderId: string,
  data: z.infer<typeof recordPaymentSchema>
) {
  // 1. Authenticate
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // 2. Validate input
  const validated = recordPaymentSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.message };
  }

  // 3. Verify workspace membership
  const member = await db.workspaceMember.findFirst({
    where: {
      userId: session.user.id,
      workspaceId,
      workspaceRole: { in: ['OWNER', 'ADMIN', 'MEMBER'] }
    }
  });

  if (!member) {
    return { success: false, error: 'Unauthorized' };
  }

  // 4. Validate PO exists and is in correct status
  const po = await db.purchaseOrder.findFirst({
    where: {
      id: purchaseOrderId,
      workspaceId,
      status: { in: ['APPROVED', 'CLOSED'] }
    },
    include: {
      payments: {
        select: { amountPaid: true }
      }
    }
  });

  if (!po) {
    return {
      success: false,
      error: 'PO not found or not in valid status for payment'
    };
  }

  // 5. Check payment won't exceed PO total
  const totalPaid = po.payments.reduce(
    (sum, p) => sum + Number(p.amountPaid),
    0
  );

  if (totalPaid + validated.data.amountPaid > Number(po.totalAmount)) {
    return {
      success: false,
      error: `Payment would exceed PO total. Remaining: ${
        Number(po.totalAmount) - totalPaid
      }`
    };
  }

  // 6. Create payment record
  try {
    const payment = await db.purchaseOrderPayment.create({
      data: {
        purchaseOrderId,
        workspaceId,
        amountPaid: validated.data.amountPaid,
        paymentDate: validated.data.paymentDate,
        remarks: validated.data.remarks,
        recordedById: session.user.id
      }
    });

    // 7. Revalidate cache
    revalidatePath(`/w/${workspaceId}/procurement/purchase-orders`);
    revalidatePath(`/w/${workspaceId}/procurement/purchase-orders/${purchaseOrderId}`);

    return {
      success: true,
      payment,
      newTotalPaid: totalPaid + validated.data.amountPaid
    };
  } catch (error) {
    console.error('Error recording payment:', error);
    return { success: false, error: 'Failed to record payment' };
  }
}
```

---

## Step 8: Update UI Components

### 8.1 Add Payment Status Badge

Create `src/components/procurement/payment-status-badge.tsx`:

```typescript
import { Badge } from '@/components/ui/badge';
import { calculatePaymentStatus } from '@/lib/payment-utils';

interface PaymentStatusBadgeProps {
  totalAmount: number;
  totalPaid: number;
}

export function PaymentStatusBadge({
  totalAmount,
  totalPaid
}: PaymentStatusBadgeProps) {
  const status = calculatePaymentStatus(totalAmount, totalPaid);

  const variants = {
    UNPAID: 'destructive',
    PARTIALLY_PAID: 'warning',
    PAID: 'success',
    OVERPAID: 'default'
  } as const;

  return (
    <Badge variant={variants[status]}>
      {status.replace('_', ' ')}
    </Badge>
  );
}
```

### 8.2 Add Payment Form

Create `src/app/w/[workspaceId]/procurement/purchase-orders/[poId]/_components/payment-form.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { recordPayment } from '@/actions/procurement/record-payment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const schema = z.object({
  amountPaid: z.number().positive(),
  paymentDate: z.date(),
  remarks: z.string().optional()
});

interface PaymentFormProps {
  workspaceId: string;
  purchaseOrderId: string;
  totalAmount: number;
  totalPaid: number;
  onSuccess?: () => void;
}

export function PaymentForm({
  workspaceId,
  purchaseOrderId,
  totalAmount,
  totalPaid,
  onSuccess
}: PaymentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const remainingAmount = totalAmount - totalPaid;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      amountPaid: remainingAmount,
      paymentDate: new Date(),
      remarks: ''
    }
  });

  async function onSubmit(data: z.infer<typeof schema>) {
    setIsSubmitting(true);
    const result = await recordPayment(workspaceId, purchaseOrderId, data);
    setIsSubmitting(false);

    if (result.success) {
      toast.success('Payment recorded successfully');
      form.reset();
      onSuccess?.();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label>Amount Paid</label>
        <Input
          type="number"
          step="0.01"
          {...form.register('amountPaid', { valueAsNumber: true })}
        />
        <p className="text-sm text-muted-foreground">
          Remaining: ₹{remainingAmount.toFixed(2)}
        </p>
      </div>

      <div>
        <label>Payment Date</label>
        <Input
          type="date"
          {...form.register('paymentDate', { valueAsDate: true })}
        />
      </div>

      <div>
        <label>Remarks (Optional)</label>
        <Textarea {...form.register('remarks')} />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Recording...' : 'Record Payment'}
      </Button>
    </form>
  );
}
```

---

## Step 9: Testing

### 9.1 Manual Testing

1. ✅ Record payment for APPROVED PO
2. ✅ Verify payment appears in history
3. ✅ Check payment status updates correctly
4. ✅ Try to exceed PO total (should fail)
5. ✅ Try to pay DRAFT PO (should fail)
6. ✅ Delete payment and verify recalculation

### 9.2 Automated Tests

Create `tests/payment-tracking.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculatePaymentStatus } from '@/lib/payment-utils';

describe('Payment Status Calculation', () => {
  it('should return UNPAID when no payments made', () => {
    expect(calculatePaymentStatus(100000, 0)).toBe('UNPAID');
  });

  it('should return PARTIALLY_PAID when some paid', () => {
    expect(calculatePaymentStatus(100000, 50000)).toBe('PARTIALLY_PAID');
  });

  it('should return PAID when fully paid', () => {
    expect(calculatePaymentStatus(100000, 100000)).toBe('PAID');
  });

  it('should return OVERPAID when exceeded', () => {
    expect(calculatePaymentStatus(100000, 150000)).toBe('OVERPAID');
  });
});
```

---

## Step 10: Rollback (If Needed)

If you need to rollback:

```bash
# Mark migration as rolled back
pnpm prisma migrate resolve --rolled-back <migration_name>

# Or reset database (⚠️ WARNING: Deletes all data!)
pnpm prisma migrate reset
```

---

## Verification Checklist

After migration:

- [ ] Migration applied successfully
- [ ] `purchase_order_payment` table created
- [ ] All indexes created
- [ ] Foreign keys in place
- [ ] `PaymentStatus` enum created
- [ ] Prisma Client regenerated
- [ ] TypeScript types available
- [ ] Helper functions created
- [ ] Server actions implemented
- [ ] UI components built
- [ ] Manual testing passed
- [ ] No errors in dev server

---

## Troubleshooting

### Issue: "Relation does not exist"

**Cause:** Migration not applied  
**Solution:** Run `pnpm prisma migrate dev`

### Issue: TypeScript errors

**Cause:** Prisma Client not regenerated  
**Solution:** Run `pnpm prisma generate` and restart TS server

### Issue: Cannot record payment

**Cause:** PO not in APPROVED status  
**Solution:** Approve PO first

---

## Next Steps

1. ✅ Apply migration
2. ✅ Create helper functions
3. ✅ Implement server actions
4. ✅ Build UI components
5. 🔄 Add to navigation
6. 🔄 Write comprehensive tests
7. 🔄 Deploy to staging
8. 🔄 User acceptance testing
9. 🔄 Deploy to production

---

## Documentation

- **Design**: `PAYMENT_TRACKING_DESIGN.md`
- **Quick Reference**: `PAYMENT_TRACKING_REFERENCE.md`
- **Schema Summary**: `PO_PAYMENT_SCHEMA_SUMMARY.md`
- **Migration**: This file

---

## Support

For issues or questions:
1. Review design documentation
2. Check quick reference guide
3. Consult schema summary
4. Review existing code patterns
