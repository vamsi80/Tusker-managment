# Purchase Order & Payment Tracking - Schema Summary

## Complete Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PURCHASE ORDER MODULE                                │
└─────────────────────────────────────────────────────────────────────────────┘

User ──────────────┐
                   │ createdBy
                   ├──────────────────────┐
                   │ approvedBy           │
                   │                      ▼
Workspace ─────────┤              ┌──────────────────┐
                   │              │  PurchaseOrder   │
                   │              ├──────────────────┤
Vendor ────────────┤              │ • poNumber       │
                   │              │ • totalAmount    │
                   │              │ • currency       │
Project ───────────┤              │ • status         │
  (optional)       │              │ • createdAt      │
                   │              │ • approvedAt     │
                   │              └────────┬─────────┘
                   │                       │
                   │                       │ 1:N
                   │                       │
                   │              ┌────────▼──────────────┐
                   │              │ PurchaseOrderItem     │
                   │              ├───────────────────────┤
Material ──────────┤              │ • orderedQuantity     │
                   │              │ • unitPrice           │
Unit ──────────────┤              │ • lineTotal           │
                   │              └───────────────────────┘
IndentItem ────────┘
  (optional)

┌─────────────────────────────────────────────────────────────────────────────┐
│                       PAYMENT TRACKING MODULE                                │
└─────────────────────────────────────────────────────────────────────────────┘

PurchaseOrder ─────┐
                   │ 1:N
                   │
                   ▼
          ┌────────────────────────┐
          │ PurchaseOrderPayment   │
          ├────────────────────────┤
          │ • amountPaid           │
          │ • paymentDate          │
          │ • remarks              │
          │ • recordedById ────────┼──────► User (accountant)
          │ • workspaceId ─────────┼──────► Workspace
          └────────────────────────┘

Payment Status (DERIVED):
  totalPaid = SUM(PurchaseOrderPayment.amountPaid)
  
  if totalPaid == 0                    → UNPAID
  if totalPaid < PO.totalAmount        → PARTIALLY_PAID
  if totalPaid == PO.totalAmount       → PAID
  if totalPaid > PO.totalAmount        → OVERPAID
```

---

## Data Flow: From Indent to Payment

```
┌──────────────┐
│ IndentItem   │ (status: APPROVED, has vendor & price)
└──────┬───────┘
       │
       │ Create PO from approved items
       ▼
┌──────────────────┐
│ PurchaseOrder    │ (status: DRAFT)
│ + Items          │
└──────┬───────────┘
       │
       │ Approve PO
       ▼
┌──────────────────┐
│ PurchaseOrder    │ (status: APPROVED)
└──────┬───────────┘
       │
       │ Record payments (manual)
       ▼
┌──────────────────────┐
│ PurchaseOrderPayment │ (multiple records)
│ Payment 1: ₹30,000   │
│ Payment 2: ₹30,000   │
│ Payment 3: ₹40,000   │
└──────┬───────────────┘
       │
       │ Calculate status
       ▼
┌──────────────────┐
│ Payment Status   │ (PAID: ₹1,00,000 / ₹1,00,000)
└──────────────────┘
```

---

## Schema Definitions (Prisma)

### PurchaseOrder
```prisma
model PurchaseOrder {
  id              String   @id @default(uuid())
  poNumber        String   @unique
  workspaceId     String
  vendorId        String
  projectId       String?
  totalAmount     Decimal  @db.Decimal(15, 2)
  currency        String   @default("INR")
  status          POStatus @default(DRAFT)
  createdById     String
  approvedById    String?
  createdAt       DateTime @default(now())
  approvedAt      DateTime?
  updatedAt       DateTime @updatedAt
  
  workspace  Workspace              @relation(...)
  vendor     Vendor                 @relation(...)
  project    Project?               @relation(...)
  createdBy  User                   @relation("POCreator", ...)
  approvedBy User?                  @relation("POApprover", ...)
  items      PurchaseOrderItem[]
  payments   PurchaseOrderPayment[]
}
```

### PurchaseOrderItem
```prisma
model PurchaseOrderItem {
  id              String  @id @default(uuid())
  purchaseOrderId String
  materialId      String
  unitId          String
  orderedQuantity Decimal @db.Decimal(15, 3)
  unitPrice       Decimal @db.Decimal(15, 2)
  lineTotal       Decimal @db.Decimal(15, 2)
  indentItemId    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  purchaseOrder PurchaseOrder @relation(...)
  material      Material      @relation(...)
  unit          Unit          @relation(...)
  indentItem    IndentItem?   @relation(...)
}
```

### PurchaseOrderPayment
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
}
```

### Enums
```prisma
enum POStatus {
  DRAFT
  APPROVED
  CANCELLED
  CLOSED
}

enum PaymentStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
  OVERPAID
}
```

---

## Key Relationships

### User Relations
```typescript
User {
  // PO ownership
  createdPurchaseOrders  PurchaseOrder[] @relation("POCreator")
  approvedPurchaseOrders PurchaseOrder[] @relation("POApprover")
  
  // Payment recording
  recordedPayments PurchaseOrderPayment[] @relation("PaymentRecorder")
}
```

### Workspace Relations
```typescript
Workspace {
  purchaseOrders PurchaseOrder[]
  // Payments inherit workspace from PO
}
```

### PurchaseOrder Relations
```typescript
PurchaseOrder {
  // Header relations
  workspace  Workspace
  vendor     Vendor
  project    Project?
  createdBy  User
  approvedBy User?
  
  // Children
  items    PurchaseOrderItem[]
  payments PurchaseOrderPayment[]
}
```

---

## Business Rules Summary

### Purchase Order Rules

1. **Creation**
   - Must belong to exactly ONE workspace and ONE vendor
   - Can optionally link to a project
   - Must be created from APPROVED indent items
   - Total amount = SUM(item.lineTotal)

2. **Approval**
   - Can only approve DRAFT POs
   - Must have at least one item
   - Requires OWNER/ADMIN role

3. **Status Transitions**
   ```
   DRAFT → APPROVED → CLOSED
     ↓         ↓
   CANCELLED CANCELLED
   ```

### Payment Rules

1. **Recording**
   - Only for APPROVED or CLOSED POs
   - Amount must be > 0
   - Payment date ≤ today
   - Total payments ≤ PO total amount

2. **Status Derivation**
   - UNPAID: No payments
   - PARTIALLY_PAID: 0 < paid < total
   - PAID: paid ≥ total
   - OVERPAID: paid > total (error condition)

3. **Data Integrity**
   - Payments are immutable records
   - Never overwrite, always append
   - Each payment linked to User who recorded it
   - Workspace isolation enforced

---

## Database Constraints

### Foreign Keys

| From | To | On Delete |
|------|-----|-----------|
| PurchaseOrder.workspaceId | Workspace.id | CASCADE |
| PurchaseOrder.vendorId | Vendor.id | RESTRICT |
| PurchaseOrder.projectId | Project.id | SET NULL |
| PurchaseOrder.createdById | User.id | - |
| PurchaseOrder.approvedById | User.id | - |
| PurchaseOrderItem.purchaseOrderId | PurchaseOrder.id | CASCADE |
| PurchaseOrderItem.materialId | Material.id | RESTRICT |
| PurchaseOrderItem.unitId | Unit.id | RESTRICT |
| PurchaseOrderItem.indentItemId | IndentItem.id | SET NULL |
| PurchaseOrderPayment.purchaseOrderId | PurchaseOrder.id | CASCADE |
| PurchaseOrderPayment.recordedById | User.id | - |

### Unique Constraints

- `PurchaseOrder.poNumber` - Globally unique

### Indexes

**PurchaseOrder:**
- `workspaceId`, `vendorId`, `projectId`, `status`
- `createdById`, `approvedById`, `poNumber`
- `[workspaceId, status]`, `[workspaceId, createdAt]`

**PurchaseOrderItem:**
- `purchaseOrderId`, `materialId`, `indentItemId`

**PurchaseOrderPayment:**
- `purchaseOrderId`, `workspaceId`, `recordedById`, `paymentDate`
- `[purchaseOrderId, paymentDate]`

---

## Typical Queries

### Get PO with Payment Status
```typescript
const po = await db.purchaseOrder.findUnique({
  where: { id: poId },
  include: {
    vendor: true,
    items: {
      include: {
        material: true,
        unit: true
      }
    },
    payments: {
      select: { amountPaid: true }
    }
  }
});

const totalPaid = po.payments.reduce(
  (sum, p) => sum + Number(p.amountPaid),
  0
);

const paymentStatus = calculatePaymentStatus(
  Number(po.totalAmount),
  totalPaid
);
```

### List POs with Payment Summary
```typescript
const pos = await db.purchaseOrder.findMany({
  where: { workspaceId },
  include: {
    vendor: true,
    payments: {
      select: { amountPaid: true }
    },
    _count: {
      select: { items: true }
    }
  }
});

const posWithStatus = pos.map(po => ({
  ...po,
  totalPaid: po.payments.reduce((s, p) => s + Number(p.amountPaid), 0),
  paymentStatus: calculatePaymentStatus(
    Number(po.totalAmount),
    po.payments.reduce((s, p) => s + Number(p.amountPaid), 0)
  )
}));
```

### Get Payment History
```typescript
const payments = await db.purchaseOrderPayment.findMany({
  where: { purchaseOrderId },
  include: {
    recordedBy: {
      select: { name: true, email: true }
    }
  },
  orderBy: { paymentDate: 'desc' }
});
```

---

## Migration Checklist

- [ ] Add PurchaseOrder model to schema
- [ ] Add PurchaseOrderItem model to schema
- [ ] Add PurchaseOrderPayment model to schema
- [ ] Add POStatus enum
- [ ] Add PaymentStatus enum
- [ ] Add reverse relations to User model
- [ ] Add reverse relations to Workspace model
- [ ] Add reverse relations to Vendor model
- [ ] Add reverse relations to Project model
- [ ] Add reverse relations to Material model
- [ ] Add reverse relations to Unit model
- [ ] Add reverse relations to IndentItem model
- [ ] Run `prisma migrate dev --name add_po_and_payment_modules`
- [ ] Verify all tables created
- [ ] Verify all indexes created
- [ ] Verify all foreign keys created
- [ ] Regenerate Prisma Client
- [ ] Update TypeScript types

---

## File Structure

```
src/
├── actions/
│   └── procurement/
│       ├── create-purchase-order.ts
│       ├── approve-purchase-order.ts
│       ├── cancel-purchase-order.ts
│       └── record-payment.ts
│
├── data/
│   └── procurement/
│       ├── purchase-orders.ts
│       └── payments.ts
│
└── app/
    └── w/
        └── [workspaceId]/
            └── procurement/
                ├── purchase-orders/
                │   ├── page.tsx
                │   ├── [poId]/
                │   │   └── page.tsx
                │   └── _components/
                │       ├── po-table.tsx
                │       ├── create-po-dialog.tsx
                │       ├── payment-form.tsx
                │       └── payment-history.tsx
                └── indent/
                    └── _components/
                        └── create-po-button.tsx
```

---

## Next Steps

1. ✅ Schema designed and documented
2. 🔄 Run migration to create tables
3. 🔄 Implement data access layer
4. 🔄 Create server actions
5. 🔄 Build UI components
6. 🔄 Add navigation links
7. 🔄 Write tests
8. 🔄 Deploy to production

---

## Documentation Files

- `PURCHASE_ORDER_DESIGN.md` - Complete PO module design
- `PURCHASE_ORDER_RULES.md` - Business rules quick reference
- `PURCHASE_ORDER_MIGRATION.md` - Migration guide
- `PAYMENT_TRACKING_DESIGN.md` - Complete payment module design
- `PAYMENT_TRACKING_REFERENCE.md` - Payment quick reference
- `SCHEMA_SUMMARY.md` - This file

---

## Support & Resources

For questions or issues:
1. Review the design documents
2. Check the quick reference guides
3. Consult the migration guide
4. Review existing procurement code patterns
