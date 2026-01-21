# Purchase Order Module - Design Documentation

## Overview

This document outlines the design and implementation of the Purchase Order (PO) module for the Tusker Management System. The PO module is built on top of the existing Prisma + PostgreSQL schema and integrates seamlessly with the procurement workflow.

## Scope

### ✅ INCLUDED
- **Purchase Order Header** (`PurchaseOrder`)
- **Purchase Order Line Items** (`PurchaseOrderItem`)
- **PO Lifecycle Status** (`POStatus` enum)
- Multi-tenant workspace isolation
- Role-based access control integration
- Vendor and project linkage
- Traceability to source indent items

### ❌ EXCLUDED (Future Extensions)
- Delivery tracking
- Invoice management
- GST/tax breakup
- Accounting ledger integration
- Audit logs

---

## Database Schema

### 1. PurchaseOrder (PO Header)

The main Purchase Order entity that represents a commitment to purchase materials from a vendor.

```prisma
model PurchaseOrder {
  id       String   @id @default(uuid())
  poNumber String   @unique // Unique PO identifier (e.g., PO-2026-001)
  
  // Multi-tenant context
  workspaceId String
  vendorId    String
  projectId   String? // Optional project linkage
  
  // Financial details
  totalAmount Decimal  @db.Decimal(15, 2) // Total committed amount
  currency    String   @default("INR")    // Currency code (INR, USD, etc.)
  
  // Lifecycle management
  status POStatus @default(DRAFT)
  
  // User actions (ownership tracking)
  createdById  String
  approvedById String?
  
  // Timestamps
  createdAt  DateTime  @default(now())
  approvedAt DateTime?
  updatedAt  DateTime  @updatedAt
  
  // Relations
  workspace  Workspace @relation(...)
  vendor     Vendor    @relation(...)
  project    Project?  @relation(...)
  createdBy  User      @relation("POCreator", ...)
  approvedBy User?     @relation("POApprover", ...)
  items      PurchaseOrderItem[]
}
```

**Key Fields:**
- `poNumber`: Auto-generated unique identifier (implement format: `PO-{YEAR}-{SEQUENCE}`)
- `totalAmount`: Must equal sum of all line items (enforce in application logic)
- `currency`: Defaults to INR, supports multi-currency
- `status`: Lifecycle state (see POStatus enum)
- `projectId`: Optional - allows POs without project context
- `createdById` / `approvedById`: User ownership tracking

**Indexes:**
- Primary queries: `workspaceId`, `vendorId`, `status`, `poNumber`
- Composite: `[workspaceId, status]`, `[workspaceId, createdAt]`

---

### 2. PurchaseOrderItem (PO Line Items)

Individual line items within a Purchase Order, representing specific materials and quantities.

```prisma
model PurchaseOrderItem {
  id              String @id @default(uuid())
  purchaseOrderId String
  
  // Material details
  materialId String
  unitId     String
  
  // Quantity and pricing
  orderedQuantity Decimal @db.Decimal(15, 3) // Quantity ordered
  unitPrice       Decimal @db.Decimal(15, 2) // Price per unit
  lineTotal       Decimal @db.Decimal(15, 2) // Calculated: orderedQuantity * unitPrice
  
  // Traceability (optional link to source indent)
  indentItemId String?
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  purchaseOrder PurchaseOrder @relation(...)
  material      Material      @relation(...)
  unit          Unit          @relation(...)
  indentItem    IndentItem?   @relation(...)
}
```

**Key Fields:**
- `orderedQuantity`: Supports up to 3 decimal places for precision
- `unitPrice`: Price per single unit
- `lineTotal`: Pre-calculated for performance (orderedQuantity × unitPrice)
- `indentItemId`: Optional traceability to source procurement request

**Calculation Rules:**
```typescript
lineTotal = orderedQuantity * unitPrice
```

---

### 3. POStatus Enum

Represents the lifecycle states of a Purchase Order.

```prisma
enum POStatus {
  DRAFT     // PO created but not yet approved
  APPROVED  // PO approved and sent to vendor
  CANCELLED // PO cancelled (before or after approval)
  CLOSED    // PO fulfilled and closed
}
```

**Status Transitions:**
```
DRAFT → APPROVED → CLOSED
  ↓         ↓
CANCELLED  CANCELLED
```

**Business Rules:**
- `DRAFT`: Editable, can be deleted
- `APPROVED`: Immutable, can only be cancelled or closed
- `CANCELLED`: Terminal state, cannot be modified
- `CLOSED`: Terminal state, all items received and verified

---

## Core Business Rules

### 1. Multi-Tenancy & Authorization

**CRITICAL:** All PO operations must enforce workspace isolation.

```typescript
// ✅ CORRECT: Validate workspace membership
const workspaceMember = await db.workspaceMember.findFirst({
  where: {
    userId: session.userId,
    workspaceId: po.workspaceId,
    workspaceRole: { in: ['OWNER', 'ADMIN', 'MEMBER'] }
  }
});

if (!workspaceMember) {
  throw new Error('Unauthorized');
}

// ❌ WRONG: Never store WorkspaceMember reference in PO
// Authorization is validated at runtime, not stored
```

### 2. PO Creation Rules

**Prerequisites:**
1. User must be a member of the workspace
2. Vendor must exist and be active
3. Project (if specified) must belong to the workspace
4. All materials must exist and be active
5. All units must be valid

**From Indent Items:**
```typescript
// Only create PO from APPROVED indent items
const approvedItems = await db.indentItem.findMany({
  where: {
    id: { in: selectedItemIds },
    status: 'APPROVED',
    vendorId: { not: null },
    estimatedPrice: { not: null }
  }
});

if (approvedItems.length !== selectedItemIds.length) {
  throw new Error('All items must be approved with vendor and price');
}
```

### 3. Data Integrity Rules

**Rule 1: Total Amount Consistency**
```typescript
// PurchaseOrder.totalAmount MUST equal sum of all item lineTotals
const calculatedTotal = items.reduce(
  (sum, item) => sum + item.lineTotal, 
  0
);

if (purchaseOrder.totalAmount !== calculatedTotal) {
  throw new Error('Total amount mismatch');
}
```

**Rule 2: Line Total Calculation**
```typescript
// Each PurchaseOrderItem.lineTotal must be correctly calculated
const lineTotal = orderedQuantity * unitPrice;

// Round to 2 decimal places for currency
const roundedLineTotal = Math.round(lineTotal * 100) / 100;
```

**Rule 3: Approval Prerequisites**
```typescript
// A PO can only be approved if:
// 1. Status is DRAFT
// 2. Has at least one item
// 3. All items have valid material, unit, quantity, and price

if (po.status !== 'DRAFT') {
  throw new Error('Only DRAFT POs can be approved');
}

if (po.items.length === 0) {
  throw new Error('Cannot approve PO without items');
}
```

### 4. Vendor & Project Constraints

**Vendor Constraint:**
- One PO belongs to exactly ONE vendor
- All items in a PO must be from the same vendor
- Vendor cannot be deleted if referenced by POs (`onDelete: Restrict`)

**Project Constraint:**
- PO can optionally link to a project
- Project must belong to the same workspace
- If project is deleted, PO.projectId is set to NULL (`onDelete: SetNull`)

---

## Implementation Guidelines

### 1. PO Number Generation

Implement auto-generation with workspace-scoped sequences:

```typescript
async function generatePONumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  
  // Get the last PO number for this workspace and year
  const lastPO = await db.purchaseOrder.findFirst({
    where: {
      workspaceId,
      poNumber: { startsWith: `PO-${year}-` }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  let sequence = 1;
  if (lastPO) {
    const match = lastPO.poNumber.match(/PO-\d{4}-(\d+)/);
    sequence = match ? parseInt(match[1]) + 1 : 1;
  }
  
  return `PO-${year}-${sequence.toString().padStart(4, '0')}`;
}

// Example: PO-2026-0001, PO-2026-0002, etc.
```

### 2. Creating a PO from Indent Items

```typescript
async function createPOFromIndentItems(
  workspaceId: string,
  vendorId: string,
  projectId: string | null,
  indentItemIds: string[],
  userId: string
) {
  // 1. Validate indent items
  const indentItems = await db.indentItem.findMany({
    where: {
      id: { in: indentItemIds },
      status: 'APPROVED',
      vendorId,
      estimatedPrice: { not: null }
    },
    include: {
      material: true,
      unit: true
    }
  });
  
  if (indentItems.length !== indentItemIds.length) {
    throw new Error('Invalid indent items');
  }
  
  // 2. Calculate totals
  const items = indentItems.map(item => ({
    materialId: item.materialId,
    unitId: item.unitId!,
    orderedQuantity: item.quantity,
    unitPrice: item.estimatedPrice!,
    lineTotal: item.quantity * item.estimatedPrice!,
    indentItemId: item.id
  }));
  
  const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
  
  // 3. Generate PO number
  const poNumber = await generatePONumber(workspaceId);
  
  // 4. Create PO with items (transaction)
  return await db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        workspaceId,
        vendorId,
        projectId,
        totalAmount,
        currency: 'INR',
        status: 'DRAFT',
        createdById: userId,
        items: {
          create: items
        }
      },
      include: {
        items: {
          include: {
            material: true,
            unit: true
          }
        },
        vendor: true,
        project: true
      }
    });
    
    return po;
  });
}
```

### 3. Approving a PO

```typescript
async function approvePO(
  poId: string,
  userId: string,
  workspaceId: string
) {
  // 1. Validate PO exists and is in DRAFT status
  const po = await db.purchaseOrder.findFirst({
    where: {
      id: poId,
      workspaceId,
      status: 'DRAFT'
    },
    include: {
      items: true
    }
  });
  
  if (!po) {
    throw new Error('PO not found or not in DRAFT status');
  }
  
  if (po.items.length === 0) {
    throw new Error('Cannot approve PO without items');
  }
  
  // 2. Update status
  return await db.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date()
    }
  });
}
```

### 4. Querying POs

**List POs for a workspace:**
```typescript
const pos = await db.purchaseOrder.findMany({
  where: {
    workspaceId,
    status: { in: ['DRAFT', 'APPROVED'] } // Filter by status
  },
  include: {
    vendor: true,
    project: true,
    createdBy: { select: { name: true, email: true } },
    approvedBy: { select: { name: true, email: true } },
    _count: { select: { items: true } }
  },
  orderBy: { createdAt: 'desc' }
});
```

**Get PO with full details:**
```typescript
const po = await db.purchaseOrder.findUnique({
  where: { id: poId },
  include: {
    vendor: true,
    project: true,
    createdBy: true,
    approvedBy: true,
    items: {
      include: {
        material: true,
        unit: true,
        indentItem: {
          include: {
            indentDetails: true
          }
        }
      }
    }
  }
});
```

---

## Future Extensions

The schema is designed to support future extensions without breaking changes:

### 1. Delivery Tracking
```prisma
model Delivery {
  id              String   @id @default(uuid())
  purchaseOrderId String
  deliveryNumber  String   @unique
  deliveryDate    DateTime
  receivedById    String
  status          DeliveryStatus
  
  purchaseOrder PurchaseOrder @relation(...)
  receivedBy    User          @relation(...)
  items         DeliveryItem[]
}

model DeliveryItem {
  id                  String  @id @default(uuid())
  deliveryId          String
  purchaseOrderItemId String
  receivedQuantity    Decimal
  
  delivery          Delivery          @relation(...)
  purchaseOrderItem PurchaseOrderItem @relation(...)
}
```

### 2. Invoice Management
```prisma
model Invoice {
  id              String   @id @default(uuid())
  purchaseOrderId String
  invoiceNumber   String   @unique
  invoiceDate     DateTime
  dueDate         DateTime
  totalAmount     Decimal
  taxAmount       Decimal
  status          InvoiceStatus
  
  purchaseOrder PurchaseOrder @relation(...)
}
```

### 3. Payment Tracking
```prisma
model Payment {
  id            String   @id @default(uuid())
  invoiceId     String
  paymentDate   DateTime
  amount        Decimal
  paymentMethod String
  reference     String?
  
  invoice Invoice @relation(...)
}
```

---

## Performance Considerations

### Indexes
All critical query paths are indexed:
- Workspace isolation: `workspaceId`
- Status filtering: `status`, `[workspaceId, status]`
- Vendor lookups: `vendorId`
- PO number searches: `poNumber`
- Time-based queries: `[workspaceId, createdAt]`

### Caching Strategy
```typescript
// Cache PO list for workspace
const cacheKey = `workspace:${workspaceId}:pos:${status}`;
const cacheTags = [
  `workspace:${workspaceId}:pos`,
  `vendor:${vendorId}:pos`
];

// Invalidate on:
// - PO creation
// - PO status change
// - PO item modification
```

### Database Constraints
- `onDelete: Cascade`: Workspace deletion cascades to POs
- `onDelete: Restrict`: Vendor/Material deletion blocked if referenced
- `onDelete: SetNull`: Project deletion nullifies PO.projectId

---

## Testing Checklist

### Unit Tests
- [ ] PO number generation (sequence, year rollover)
- [ ] Line total calculation (rounding, precision)
- [ ] Total amount validation
- [ ] Status transition validation

### Integration Tests
- [ ] Create PO from indent items
- [ ] Approve PO (valid and invalid states)
- [ ] Cancel PO
- [ ] Close PO
- [ ] Multi-workspace isolation

### Authorization Tests
- [ ] Non-member cannot create PO
- [ ] Non-member cannot view PO
- [ ] VIEWER role cannot approve PO
- [ ] Cross-workspace PO access denied

---

## API Endpoints (Suggested)

```typescript
// POST /api/workspaces/:workspaceId/purchase-orders
// Create PO from indent items
createPO(workspaceId, { vendorId, projectId?, indentItemIds })

// GET /api/workspaces/:workspaceId/purchase-orders
// List POs with filters
listPOs(workspaceId, { status?, vendorId?, projectId?, page, limit })

// GET /api/workspaces/:workspaceId/purchase-orders/:poId
// Get PO details
getPO(workspaceId, poId)

// PATCH /api/workspaces/:workspaceId/purchase-orders/:poId/approve
// Approve PO
approvePO(workspaceId, poId)

// PATCH /api/workspaces/:workspaceId/purchase-orders/:poId/cancel
// Cancel PO
cancelPO(workspaceId, poId, { reason })

// PATCH /api/workspaces/:workspaceId/purchase-orders/:poId/close
// Close PO
closePO(workspaceId, poId)
```

---

## Summary

This Purchase Order module provides:
- ✅ Clean, minimal, production-safe design
- ✅ Multi-tenant isolation with workspace scoping
- ✅ Role-based access control integration
- ✅ Full traceability from indent to PO
- ✅ Extensible schema for future features
- ✅ Comprehensive business rule enforcement
- ✅ Optimized indexes for performance

The design follows best practices for:
- Data integrity (constraints, validations)
- Scalability (indexes, caching)
- Maintainability (clear separation of concerns)
- Future-proofing (extensible without breaking changes)
