# Payment Tracking - Quick Reference

## 🎯 Core Principles

1. **Payments are RECORDS, not updates** - Never overwrite, always append
2. **Each payment = separate row** - Complete audit trail
3. **Status is DERIVED** - Calculated from sum of payments vs PO total
4. **User tracking mandatory** - Every payment linked to User.id
5. **Workspace scoped** - Multi-tenant isolation enforced

---

## 📊 Payment Status Logic

```typescript
totalPaid = SUM(all payments for PO)

if (totalPaid === 0)           → UNPAID
if (totalPaid < PO.totalAmount) → PARTIALLY_PAID
if (totalPaid === PO.totalAmount) → PAID
if (totalPaid > PO.totalAmount) → OVERPAID ⚠️
```

**Important:** Status is **NOT stored** in database, always calculated dynamically.

---

## ✅ Validation Rules

### Can Record Payment If:
- ✅ PO status is `APPROVED` or `CLOSED`
- ✅ User is workspace member
- ✅ Amount > 0
- ✅ Payment date ≤ today
- ✅ Total payments (including new) ≤ PO total amount

### Cannot Record Payment If:
- ❌ PO status is `DRAFT` or `CANCELLED`
- ❌ Amount ≤ 0
- ❌ Payment date is in future
- ❌ Would cause total payments > PO total amount
- ❌ User is not workspace member

---

## 🔢 Calculation Examples

### Example 1: Partial Payments
```
PO Total: ₹1,00,000

Payment 1: ₹30,000 → Status: PARTIALLY_PAID (₹30,000 / ₹1,00,000)
Payment 2: ₹30,000 → Status: PARTIALLY_PAID (₹60,000 / ₹1,00,000)
Payment 3: ₹40,000 → Status: PAID (₹1,00,000 / ₹1,00,000)
```

### Example 2: Advance Payment
```
PO Total: ₹50,000

Payment 1: ₹25,000 (Advance 50%) → Status: PARTIALLY_PAID
Payment 2: ₹25,000 (Final)       → Status: PAID
```

### Example 3: Validation Failure
```
PO Total: ₹1,00,000
Already Paid: ₹80,000
Remaining: ₹20,000

Attempt to pay: ₹30,000 ❌ REJECTED
Reason: Would exceed PO total (₹80,000 + ₹30,000 > ₹1,00,000)
```

---

## 🗄️ Database Schema

### PurchaseOrderPayment Table

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | ✅ | Primary key |
| `purchaseOrderId` | UUID | ✅ | FK to purchase_order |
| `workspaceId` | UUID | ✅ | FK to workspace (isolation) |
| `amountPaid` | Decimal(15,2) | ✅ | Amount in this payment |
| `paymentDate` | DateTime | ✅ | When payment was made |
| `remarks` | String | ❌ | Optional notes |
| `recordedById` | String | ✅ | FK to user (accountant) |
| `createdAt` | DateTime | ✅ | When record was created |
| `updatedAt` | DateTime | ✅ | Last updated |

### Indexes
- `purchaseOrderId` - Payment lookup
- `workspaceId` - Multi-tenant queries
- `recordedById` - User's payment history
- `paymentDate` - Date-based queries
- `[purchaseOrderId, paymentDate]` - Payment history (composite)

---

## 💻 Common Code Patterns

### 1. Record a Payment
```typescript
const payment = await db.purchaseOrderPayment.create({
  data: {
    purchaseOrderId,
    workspaceId,
    amountPaid: 50000,
    paymentDate: new Date('2026-01-21'),
    remarks: 'Advance payment - 50%',
    recordedById: userId
  }
});
```

### 2. Get Payment Status
```typescript
const result = await db.purchaseOrderPayment.aggregate({
  where: { purchaseOrderId },
  _sum: { amountPaid: true },
  _count: true
});

const totalPaid = result._sum.amountPaid || 0;
const status = calculatePaymentStatus(po.totalAmount, totalPaid);
```

### 3. Get Payment History
```typescript
const payments = await db.purchaseOrderPayment.findMany({
  where: { purchaseOrderId, workspaceId },
  include: {
    recordedBy: { select: { name: true, email: true } }
  },
  orderBy: { paymentDate: 'desc' }
});
```

### 4. Validate Before Payment
```typescript
// Check total won't exceed PO amount
const totalPaid = await db.purchaseOrderPayment.aggregate({
  where: { purchaseOrderId },
  _sum: { amountPaid: true }
});

const currentTotal = totalPaid._sum.amountPaid || 0;
if (currentTotal + newAmount > po.totalAmount) {
  throw new Error('Payment would exceed PO total');
}
```

---

## 🎨 UI Components

### Payment Entry Form
```
┌─────────────────────────────────────┐
│ Record Payment                      │
├─────────────────────────────────────┤
│ PO Total:    ₹1,00,000.00           │
│ Paid:        ₹50,000.00             │
│ Remaining:   ₹50,000.00             │
├─────────────────────────────────────┤
│ Amount: [________] ₹                │
│ Date:   [📅 21 Jan 2026]            │
│ Remarks: [________________]         │
│                                     │
│ [Cancel]        [Record Payment]    │
└─────────────────────────────────────┘
```

### Payment Status Badge
```typescript
// Color coding
UNPAID         → Red/Destructive
PARTIALLY_PAID → Yellow/Warning
PAID           → Green/Success
OVERPAID       → Orange/Alert
```

### Payment History Table
```
Date         | Amount      | Running Total | Recorded By | Remarks
-------------|-------------|---------------|-------------|-------------
15 Jan 2026  | ₹50,000.00  | ₹50,000.00    | John Doe    | Advance 50%
21 Jan 2026  | ₹50,000.00  | ₹1,00,000.00  | John Doe    | Final
```

---

## 🔒 Authorization Matrix

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|--------|-------|-------|--------|--------|
| View Payments | ✅ | ✅ | ✅ | ✅ |
| Record Payment | ✅ | ✅ | ✅* | ❌ |
| Delete Own Payment | ✅ | ✅ | ✅ | ❌ |
| Delete Any Payment | ✅ | ✅ | ❌ | ❌ |

*Consider adding specific "Accountant" permission

---

## 🚫 Common Errors & Solutions

### Error: "Cannot add payment to DRAFT PO"
**Cause:** PO must be APPROVED before payments can be recorded  
**Solution:** Approve the PO first

### Error: "Payment would exceed PO total"
**Cause:** Sum of payments would be > PO.totalAmount  
**Solution:** Reduce payment amount or check for duplicate entries

### Error: "Payment date cannot be in future"
**Cause:** Payment date is set to a future date  
**Solution:** Use today's date or a past date

### Error: "Unauthorized"
**Cause:** User is not a workspace member  
**Solution:** Verify user has workspace access

---

## 📈 Reporting Queries

### Total Paid by Vendor
```typescript
const result = await db.purchaseOrder.groupBy({
  by: ['vendorId'],
  where: { workspaceId },
  _sum: {
    totalAmount: true
  }
});

// Then aggregate payments for each vendor's POs
```

### Pending Payments
```typescript
const pos = await db.purchaseOrder.findMany({
  where: { workspaceId, status: 'APPROVED' },
  include: {
    payments: { select: { amountPaid: true } }
  }
});

const pending = pos.filter(po => {
  const paid = po.payments.reduce((s, p) => s + p.amountPaid, 0);
  return paid < po.totalAmount;
});
```

### Payment Activity by Date Range
```typescript
const payments = await db.purchaseOrderPayment.findMany({
  where: {
    workspaceId,
    paymentDate: {
      gte: startDate,
      lte: endDate
    }
  },
  include: {
    purchaseOrder: {
      include: { vendor: true }
    }
  }
});
```

---

## 🧪 Testing Scenarios

### Happy Path
1. ✅ Record payment for APPROVED PO
2. ✅ Record multiple partial payments
3. ✅ Record final payment that completes PO
4. ✅ View payment history
5. ✅ Delete payment (error correction)

### Error Cases
1. ❌ Record payment for DRAFT PO → Error
2. ❌ Record payment for CANCELLED PO → Error
3. ❌ Record payment exceeding remaining → Error
4. ❌ Record negative amount → Error
5. ❌ Record future payment date → Error
6. ❌ Non-member records payment → Unauthorized

### Edge Cases
1. 🔄 Payment exactly equals remaining amount
2. 🔄 Multiple payments on same date
3. 🔄 Delete payment and recalculate status
4. 🔄 Zero remaining after multiple payments
5. 🔄 Payment with very long remarks

---

## 🔍 Debugging Checklist

### Payment Not Showing?
- [ ] Check `workspaceId` matches PO's workspace
- [ ] Verify payment was committed to database
- [ ] Check query includes correct `purchaseOrderId`

### Wrong Payment Status?
- [ ] Recalculate: `SUM(payments.amountPaid)` vs `PO.totalAmount`
- [ ] Check for duplicate payment records
- [ ] Verify all payments have correct `purchaseOrderId`

### Cannot Record Payment?
- [ ] Verify PO status is APPROVED or CLOSED
- [ ] Check user is workspace member
- [ ] Verify amount > 0 and ≤ remaining
- [ ] Check payment date ≤ today

---

## 📚 Related Documentation

- **Full Design**: `PAYMENT_TRACKING_DESIGN.md`
- **PO Design**: `PURCHASE_ORDER_DESIGN.md`
- **Migration Guide**: (To be created)
- **API Reference**: (To be created)

---

## 🚀 Quick Start

### 1. Add Payment Entry UI
```typescript
// src/app/w/[workspaceId]/procurement/purchase-orders/[poId]/_components/payment-form.tsx
```

### 2. Create Server Action
```typescript
// src/actions/procurement/record-payment.ts
export async function recordPayment(
  workspaceId: string,
  poId: string,
  data: PaymentInput
) {
  // Implementation here
}
```

### 3. Add Payment History Component
```typescript
// src/app/w/[workspaceId]/procurement/purchase-orders/[poId]/_components/payment-history.tsx
```

### 4. Update PO Detail Page
```typescript
// Show payment status badge
// Show payment history table
// Add "Record Payment" button
```

---

## 💡 Best Practices

1. **Always validate before recording** - Check PO status, amount, date
2. **Use database aggregation** - Don't sum in JavaScript
3. **Show remaining amount** - Help accountants avoid errors
4. **Provide payment history** - Full transparency
5. **Allow deletion for corrections** - But with proper authorization
6. **Cache payment status** - For list views
7. **Log payment activities** - For audit purposes
8. **Format currency properly** - Use locale-aware formatting

---

## ⚡ Performance Tips

1. Use `aggregate` instead of loading all payments
2. Index `[purchaseOrderId, paymentDate]` for history queries
3. Cache payment status for PO list views
4. Paginate payment history for POs with many payments
5. Use `select` to fetch only needed fields

---

## 🎯 Success Metrics

- ✅ Payment entry takes < 30 seconds
- ✅ Payment status updates immediately
- ✅ Zero overpayment incidents
- ✅ Complete audit trail for all payments
- ✅ Accountants can self-correct errors
