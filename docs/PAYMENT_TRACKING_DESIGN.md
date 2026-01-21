# Payment Tracking Module - Design Documentation

## Overview

This document outlines the design and implementation of the **Manual Payment Tracking** system for Purchase Orders in the Tusker Management System. This module is designed for accountants to manually record payments against Purchase Orders.

## Scope

### ✅ INCLUDED
- **Manual Payment Entry** - Accountants manually record each payment
- **Payment History** - All payments stored as separate records
- **Payment Status Derivation** - Automatic calculation of paid/pending status
- **Multi-tenant Isolation** - Workspace-scoped payment records
- **User Tracking** - Each payment linked to the accountant who recorded it
- **Advance & Partial Payments** - Support for multiple payment types

### ❌ EXCLUDED (Out of Scope)
- Payment gateways or online payment processing
- Payment method tracking (cash, cheque, bank transfer, etc.)
- Bank integration or reconciliation
- Automated payment workflows
- Invoice linkage (future extension)
- Accounting ledger integration (future extension)

---

## Database Schema

### 1. PurchaseOrderPayment

The main payment record entity that stores each payment transaction.

```prisma
model PurchaseOrderPayment {
  id              String   @id @default(uuid())
  purchaseOrderId String
  
  // Payment details
  amountPaid  Decimal  @db.Decimal(15, 2) // Amount paid in this transaction
  paymentDate DateTime // Date when payment was made
  remarks     String?  // Optional notes (e.g., "Advance payment", "Final settlement")
  
  // Workspace context (for multi-tenant isolation)
  workspaceId String
  
  // User tracking (accountant who recorded this payment)
  recordedById String
  
  // Timestamps
  createdAt DateTime @default(now()) // When this record was created
  updatedAt DateTime @updatedAt
  
  // Relations
  purchaseOrder PurchaseOrder @relation(...)
  recordedBy    User          @relation("PaymentRecorder", ...)
}
```

**Key Fields:**
- `amountPaid`: The amount paid in this specific transaction (2 decimal places)
- `paymentDate`: The actual date the payment was made (not when it was recorded)
- `remarks`: Optional notes for context (e.g., "Advance 50%", "Balance payment")
- `workspaceId`: Ensures multi-tenant isolation
- `recordedById`: The User who entered this payment record

**Design Principles:**
- ✅ **Immutable Records**: Once created, payments should not be edited (only deleted if error)
- ✅ **Append-Only**: New payments are always added, never overwrite existing ones
- ✅ **Audit Trail**: `createdAt` tracks when the payment was recorded

**Indexes:**
- Primary queries: `purchaseOrderId`, `workspaceId`, `paymentDate`
- Composite: `[purchaseOrderId, paymentDate]` for payment history

---

### 2. PaymentStatus Enum

Represents the derived payment status of a Purchase Order.

```prisma
enum PaymentStatus {
  UNPAID          // No payments made yet
  PARTIALLY_PAID  // Some payments made, but total < PO amount
  PAID            // Total payments >= PO amount
  OVERPAID        // Total payments > PO amount (edge case)
}
```

**Status Calculation:**
```typescript
function calculatePaymentStatus(
  totalAmount: number,
  totalPaid: number
): PaymentStatus {
  if (totalPaid === 0) return 'UNPAID';
  if (totalPaid < totalAmount) return 'PARTIALLY_PAID';
  if (totalPaid === totalAmount) return 'PAID';
  return 'OVERPAID'; // totalPaid > totalAmount
}
```

**Important Notes:**
- ⚠️ Payment status is **DERIVED**, not stored in the database
- ⚠️ Status is calculated dynamically from `SUM(payments.amountPaid)` vs `PO.totalAmount`
- ⚠️ `OVERPAID` status indicates a data integrity issue that should be investigated

---

## Core Business Rules

### 1. Payment Entry Rules

**Prerequisites:**
1. PO must exist and belong to the workspace
2. PO status must be `APPROVED` or `CLOSED` (NOT `DRAFT` or `CANCELLED`)
3. User must be a workspace member with appropriate permissions
4. Payment amount must be > 0
5. Payment date must not be in the future

**Validation:**
```typescript
async function validatePaymentEntry(
  purchaseOrderId: string,
  amountPaid: number,
  paymentDate: Date,
  workspaceId: string
) {
  // 1. Validate PO exists and is in correct status
  const po = await db.purchaseOrder.findFirst({
    where: {
      id: purchaseOrderId,
      workspaceId,
      status: { in: ['APPROVED', 'CLOSED'] }
    },
    include: {
      payments: true
    }
  });
  
  if (!po) {
    throw new Error('PO not found or not in valid status for payment');
  }
  
  // 2. Validate amount
  if (amountPaid <= 0) {
    throw new Error('Payment amount must be greater than 0');
  }
  
  // 3. Calculate total paid so far
  const totalPaid = po.payments.reduce(
    (sum, p) => sum + Number(p.amountPaid),
    0
  );
  
  // 4. Check if new payment would exceed PO total
  if (totalPaid + amountPaid > Number(po.totalAmount)) {
    throw new Error(
      `Payment would exceed PO total. ` +
      `PO: ${po.totalAmount}, Paid: ${totalPaid}, ` +
      `New: ${amountPaid}, Excess: ${totalPaid + amountPaid - Number(po.totalAmount)}`
    );
  }
  
  // 5. Validate payment date
  if (paymentDate > new Date()) {
    throw new Error('Payment date cannot be in the future');
  }
  
  return po;
}
```

### 2. Data Integrity Rules

**Rule 1: Sum of Payments Cannot Exceed PO Total**
```typescript
// Before adding a new payment, always check:
const totalPaid = await db.purchaseOrderPayment.aggregate({
  where: { purchaseOrderId },
  _sum: { amountPaid: true }
});

const currentTotal = totalPaid._sum.amountPaid || 0;
const newTotal = currentTotal + amountPaid;

if (newTotal > po.totalAmount) {
  throw new Error('Total payments would exceed PO amount');
}
```

**Rule 2: Payments Only for Approved/Closed POs**
```typescript
// VALID: PO is APPROVED or CLOSED
if (po.status === 'APPROVED' || po.status === 'CLOSED') {
  // Allow payment entry
}

// INVALID: PO is DRAFT or CANCELLED
if (po.status === 'DRAFT' || po.status === 'CANCELLED') {
  throw new Error('Cannot add payment to DRAFT or CANCELLED PO');
}
```

**Rule 3: Workspace Isolation**
```typescript
// Payment MUST belong to the same workspace as the PO
const payment = await db.purchaseOrderPayment.create({
  data: {
    purchaseOrderId,
    workspaceId: po.workspaceId, // MUST match PO's workspace
    amountPaid,
    paymentDate,
    recordedById: userId
  }
});
```

### 3. Payment Types Supported

**Advance Payment:**
```typescript
// Payment made before PO is fully approved or delivered
{
  amountPaid: 50000,
  paymentDate: new Date('2026-01-15'),
  remarks: 'Advance payment - 50% of total'
}
```

**Partial Payment:**
```typescript
// Payment of a portion of the total amount
{
  amountPaid: 25000,
  paymentDate: new Date('2026-02-01'),
  remarks: 'Partial payment - 25%'
}
```

**Final Payment:**
```typescript
// Payment that completes the PO
{
  amountPaid: 25000,
  paymentDate: new Date('2026-02-15'),
  remarks: 'Final settlement'
}
```

**Multiple Payments:**
```typescript
// A PO can have many payment records
// Example: 3 installments
[
  { amountPaid: 30000, remarks: 'First installment' },
  { amountPaid: 30000, remarks: 'Second installment' },
  { amountPaid: 40000, remarks: 'Final installment' }
]
```

---

## Implementation Guidelines

### 1. Recording a Payment

```typescript
async function recordPayment(
  purchaseOrderId: string,
  workspaceId: string,
  userId: string,
  data: {
    amountPaid: number;
    paymentDate: Date;
    remarks?: string;
  }
) {
  // 1. Validate the payment
  const po = await validatePaymentEntry(
    purchaseOrderId,
    data.amountPaid,
    data.paymentDate,
    workspaceId
  );
  
  // 2. Create the payment record
  const payment = await db.purchaseOrderPayment.create({
    data: {
      purchaseOrderId,
      workspaceId,
      amountPaid: data.amountPaid,
      paymentDate: data.paymentDate,
      remarks: data.remarks,
      recordedById: userId
    },
    include: {
      recordedBy: {
        select: { name: true, email: true }
      }
    }
  });
  
  // 3. Calculate new payment status
  const totalPaid = await db.purchaseOrderPayment.aggregate({
    where: { purchaseOrderId },
    _sum: { amountPaid: true }
  });
  
  const paymentStatus = calculatePaymentStatus(
    Number(po.totalAmount),
    Number(totalPaid._sum.amountPaid || 0)
  );
  
  return {
    payment,
    paymentStatus,
    totalPaid: totalPaid._sum.amountPaid || 0,
    remainingAmount: Number(po.totalAmount) - Number(totalPaid._sum.amountPaid || 0)
  };
}
```

### 2. Getting Payment Status for a PO

```typescript
async function getPOPaymentStatus(purchaseOrderId: string) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      payments: {
        orderBy: { paymentDate: 'asc' }
      }
    }
  });
  
  if (!po) {
    throw new Error('PO not found');
  }
  
  const totalPaid = po.payments.reduce(
    (sum, p) => sum + Number(p.amountPaid),
    0
  );
  
  const paymentStatus = calculatePaymentStatus(
    Number(po.totalAmount),
    totalPaid
  );
  
  return {
    poNumber: po.poNumber,
    totalAmount: Number(po.totalAmount),
    totalPaid,
    remainingAmount: Number(po.totalAmount) - totalPaid,
    paymentStatus,
    paymentCount: po.payments.length,
    payments: po.payments
  };
}
```

### 3. Listing POs with Payment Status

```typescript
async function listPOsWithPaymentStatus(workspaceId: string) {
  const pos = await db.purchaseOrder.findMany({
    where: {
      workspaceId,
      status: { in: ['APPROVED', 'CLOSED'] }
    },
    include: {
      vendor: true,
      payments: {
        select: {
          amountPaid: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  return pos.map(po => {
    const totalPaid = po.payments.reduce(
      (sum, p) => sum + Number(p.amountPaid),
      0
    );
    
    const paymentStatus = calculatePaymentStatus(
      Number(po.totalAmount),
      totalPaid
    );
    
    return {
      id: po.id,
      poNumber: po.poNumber,
      vendor: po.vendor,
      totalAmount: Number(po.totalAmount),
      totalPaid,
      remainingAmount: Number(po.totalAmount) - totalPaid,
      paymentStatus,
      paymentCount: po.payments.length
    };
  });
}
```

### 4. Getting Payment History for a PO

```typescript
async function getPaymentHistory(
  purchaseOrderId: string,
  workspaceId: string
) {
  const payments = await db.purchaseOrderPayment.findMany({
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
  
  // Calculate running total
  let runningTotal = 0;
  return payments.reverse().map(payment => {
    runningTotal += Number(payment.amountPaid);
    return {
      ...payment,
      runningTotal
    };
  }).reverse();
}
```

### 5. Deleting a Payment (Error Correction)

```typescript
async function deletePayment(
  paymentId: string,
  workspaceId: string,
  userId: string
) {
  // 1. Verify payment exists and belongs to workspace
  const payment = await db.purchaseOrderPayment.findFirst({
    where: {
      id: paymentId,
      workspaceId
    },
    include: {
      purchaseOrder: true
    }
  });
  
  if (!payment) {
    throw new Error('Payment not found');
  }
  
  // 2. Check authorization (only OWNER/ADMIN or the recorder can delete)
  const member = await db.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      workspaceRole: { in: ['OWNER', 'ADMIN'] }
    }
  });
  
  const canDelete = member || payment.recordedById === userId;
  
  if (!canDelete) {
    throw new Error('Unauthorized to delete this payment');
  }
  
  // 3. Delete the payment
  await db.purchaseOrderPayment.delete({
    where: { id: paymentId }
  });
  
  return {
    success: true,
    message: 'Payment deleted successfully'
  };
}
```

---

## UI/UX Guidelines

### 1. Payment Entry Form

**Fields:**
- **Amount Paid** (required, number, > 0)
- **Payment Date** (required, date picker, <= today)
- **Remarks** (optional, text area)

**Validation:**
- Show remaining amount prominently
- Warn if payment would exceed remaining amount
- Suggest full payment amount as default

**Example UI:**
```
┌─────────────────────────────────────────┐
│ Record Payment for PO-2026-0001         │
├─────────────────────────────────────────┤
│ PO Total:      ₹1,00,000.00             │
│ Paid So Far:   ₹50,000.00               │
│ Remaining:     ₹50,000.00               │
├─────────────────────────────────────────┤
│ Amount Paid: [________] ₹               │
│              [Pay Remaining: ₹50,000]   │
│                                         │
│ Payment Date: [📅 21 Jan 2026]          │
│                                         │
│ Remarks (optional):                     │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Cancel]              [Record Payment]  │
└─────────────────────────────────────────┘
```

### 2. Payment History Display

**Columns:**
- Payment Date
- Amount Paid
- Running Total
- Remaining
- Recorded By
- Remarks
- Actions (Delete icon for recent entries)

**Example Table:**
```
┌──────────────┬─────────────┬──────────────┬────────────┬──────────────┬─────────────┬─────────┐
│ Date         │ Amount      │ Running Total│ Remaining  │ Recorded By  │ Remarks     │ Actions │
├──────────────┼─────────────┼──────────────┼────────────┼──────────────┼─────────────┼─────────┤
│ 15 Jan 2026  │ ₹50,000.00  │ ₹50,000.00   │ ₹50,000.00 │ John Doe     │ Advance 50% │ 🗑️      │
│ 21 Jan 2026  │ ₹50,000.00  │ ₹1,00,000.00 │ ₹0.00      │ John Doe     │ Final       │ 🗑️      │
└──────────────┴─────────────┴──────────────┴────────────┴──────────────┴─────────────┴─────────┘
```

### 3. Payment Status Badges

**Color Coding:**
- `UNPAID`: Red/Destructive
- `PARTIALLY_PAID`: Yellow/Warning
- `PAID`: Green/Success
- `OVERPAID`: Orange/Alert (requires investigation)

**Display Format:**
```typescript
// In PO list
<Badge variant={getPaymentStatusVariant(status)}>
  {status} ({formatCurrency(totalPaid)} / {formatCurrency(totalAmount)})
</Badge>

// Examples:
// UNPAID (₹0 / ₹1,00,000)
// PARTIALLY_PAID (₹50,000 / ₹1,00,000)
// PAID (₹1,00,000 / ₹1,00,000)
```

---

## Authorization Rules

### Payment Entry Permissions

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|--------|-------|-------|--------|--------|
| View Payments | ✅ | ✅ | ✅ | ✅ |
| Record Payment | ✅ | ✅ | ✅ (if accountant) | ❌ |
| Delete Own Payment | ✅ | ✅ | ✅ | ❌ |
| Delete Any Payment | ✅ | ✅ | ❌ | ❌ |

**Note:** Consider adding a specific "Accountant" role or permission for payment management.

---

## Future Extensions

The schema is designed to support future enhancements:

### 1. Payment Methods (Future)
```prisma
enum PaymentMethod {
  CASH
  CHEQUE
  BANK_TRANSFER
  UPI
  CARD
}

model PurchaseOrderPayment {
  // ... existing fields
  paymentMethod PaymentMethod?
  referenceNumber String? // Cheque number, transaction ID, etc.
}
```

### 2. Invoice Linkage (Future)
```prisma
model Invoice {
  id              String   @id @default(uuid())
  purchaseOrderId String
  invoiceNumber   String   @unique
  invoiceDate     DateTime
  dueDate         DateTime
  totalAmount     Decimal
  
  purchaseOrder PurchaseOrder @relation(...)
  payments      InvoicePayment[]
}

model InvoicePayment {
  id                       String @id @default(uuid())
  invoiceId                String
  purchaseOrderPaymentId   String
  
  invoice                Invoice               @relation(...)
  purchaseOrderPayment   PurchaseOrderPayment  @relation(...)
}
```

### 3. Accounting Ledger (Future)
```prisma
model LedgerEntry {
  id                       String   @id @default(uuid())
  purchaseOrderPaymentId   String?
  accountId                String
  debit                    Decimal?
  credit                   Decimal?
  
  purchaseOrderPayment PurchaseOrderPayment? @relation(...)
  account              Account               @relation(...)
}
```

---

## Performance Considerations

### Indexes
All critical query paths are indexed:
- Payment lookup: `purchaseOrderId`
- Workspace isolation: `workspaceId`
- Date-based queries: `paymentDate`
- Payment history: `[purchaseOrderId, paymentDate]`

### Aggregation Optimization
```typescript
// Instead of loading all payments and summing in JS:
// ❌ BAD
const payments = await db.purchaseOrderPayment.findMany({
  where: { purchaseOrderId }
});
const total = payments.reduce((sum, p) => sum + p.amountPaid, 0);

// ✅ GOOD - Use database aggregation
const result = await db.purchaseOrderPayment.aggregate({
  where: { purchaseOrderId },
  _sum: { amountPaid: true },
  _count: true
});
```

### Caching Strategy
```typescript
// Cache payment status for PO list views
const cacheKey = `po:${poId}:payment-status`;
const cacheTags = [
  `workspace:${workspaceId}:payments`,
  `po:${poId}:payments`
];

// Invalidate on:
// - New payment recorded
// - Payment deleted
```

---

## Testing Checklist

### Unit Tests
- [ ] Payment amount validation (> 0)
- [ ] Payment date validation (not future)
- [ ] Total payment validation (not exceed PO total)
- [ ] Payment status calculation (all scenarios)

### Integration Tests
- [ ] Record payment for APPROVED PO
- [ ] Record payment for CLOSED PO
- [ ] Reject payment for DRAFT PO
- [ ] Reject payment for CANCELLED PO
- [ ] Record multiple payments (partial)
- [ ] Record payment that completes PO
- [ ] Delete payment and recalculate status

### Authorization Tests
- [ ] Non-member cannot record payment
- [ ] VIEWER cannot record payment
- [ ] MEMBER can record payment
- [ ] User can delete own payment
- [ ] ADMIN can delete any payment

### Edge Cases
- [ ] Payment exactly equals remaining amount
- [ ] Payment slightly exceeds remaining (should reject)
- [ ] Zero payment amount (should reject)
- [ ] Negative payment amount (should reject)
- [ ] Future payment date (should reject)
- [ ] Multiple payments on same date

---

## API Endpoints (Suggested)

```typescript
// POST /api/workspaces/:workspaceId/purchase-orders/:poId/payments
// Record a new payment
recordPayment(workspaceId, poId, { amountPaid, paymentDate, remarks })

// GET /api/workspaces/:workspaceId/purchase-orders/:poId/payments
// Get payment history for a PO
getPaymentHistory(workspaceId, poId)

// GET /api/workspaces/:workspaceId/purchase-orders/:poId/payment-status
// Get payment status summary
getPaymentStatus(workspaceId, poId)

// DELETE /api/workspaces/:workspaceId/payments/:paymentId
// Delete a payment (error correction)
deletePayment(workspaceId, paymentId)

// GET /api/workspaces/:workspaceId/purchase-orders?paymentStatus=UNPAID
// List POs filtered by payment status
listPOs(workspaceId, { paymentStatus?, page, limit })
```

---

## Summary

This Payment Tracking module provides:
- ✅ **Simple, manual payment entry** for accountants
- ✅ **Complete payment history** with audit trail
- ✅ **Automatic status derivation** (UNPAID/PARTIALLY_PAID/PAID)
- ✅ **Multi-tenant isolation** with workspace scoping
- ✅ **Data integrity** enforcement (payments ≤ PO total)
- ✅ **User tracking** for accountability
- ✅ **Support for advance, partial, and multiple payments**
- ✅ **Extensible design** for future invoice/accounting integration

The design follows best practices for:
- **Immutability**: Payments are records, not updates
- **Audit Trail**: Full history of who paid what and when
- **Data Integrity**: Strict validation prevents overpayment
- **Simplicity**: No complex payment methods or gateway integration
- **Future-Proofing**: Easy to extend for invoices and accounting
