# Purchase Order Module - Business Rules Quick Reference

## 🎯 Core Principles

1. **One PO = One Workspace + One Vendor**
2. **Authorization via WorkspaceMember (runtime validation, never stored)**
3. **All actions owned by User.id**
4. **Data integrity enforced at application layer**

---

## 📋 PO Lifecycle

```
┌─────────┐
│  DRAFT  │ ← PO created, editable
└────┬────┘
     │
     ├──→ APPROVED ← PO approved, immutable
     │       │
     │       └──→ CLOSED ← PO fulfilled
     │
     └──→ CANCELLED ← PO cancelled (terminal)
```

---

## ✅ Validation Rules

### PO Creation

| Rule | Validation |
|------|------------|
| **Workspace** | User must be workspace member (OWNER/ADMIN/MEMBER) |
| **Vendor** | Must exist, be active, belong to workspace |
| **Project** | If specified, must belong to workspace |
| **Items** | Must have at least 1 item |
| **Indent Source** | Items must be APPROVED status with vendor & price |

### PO Approval

| Rule | Validation |
|------|------------|
| **Status** | Must be DRAFT |
| **Items** | Must have at least 1 item |
| **User** | Must be workspace member (OWNER/ADMIN) |
| **Total** | Must equal sum of line items |

### PO Cancellation

| Rule | Validation |
|------|------------|
| **Status** | Can be DRAFT or APPROVED |
| **User** | Must be workspace member (OWNER/ADMIN) |
| **Reason** | Optional cancellation reason |

### PO Closure

| Rule | Validation |
|------|------------|
| **Status** | Must be APPROVED |
| **User** | Must be workspace member (OWNER/ADMIN) |
| **Delivery** | (Future) All items must be received |

---

## 🔢 Calculation Rules

### Line Total
```typescript
lineTotal = orderedQuantity × unitPrice
// Round to 2 decimal places
lineTotal = Math.round(lineTotal * 100) / 100
```

### PO Total
```typescript
totalAmount = Σ(lineTotal for all items)
// Must be validated on create/update
```

### Precision
- **Quantity**: 3 decimal places (e.g., 123.456)
- **Price**: 2 decimal places (e.g., 1234.56)
- **Total**: 2 decimal places (e.g., 12345.67)

---

## 🔒 Authorization Matrix

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|--------|-------|-------|--------|--------|
| View PO | ✅ | ✅ | ✅ | ✅ |
| Create PO | ✅ | ✅ | ✅ | ❌ |
| Edit DRAFT PO | ✅ | ✅ | ✅ (own) | ❌ |
| Approve PO | ✅ | ✅ | ❌ | ❌ |
| Cancel PO | ✅ | ✅ | ❌ | ❌ |
| Close PO | ✅ | ✅ | ❌ | ❌ |

**Note:** Authorization is validated at runtime via `WorkspaceMember`, never stored in PO tables.

---

## 🗄️ Data Integrity Constraints

### Foreign Keys

| Field | References | On Delete |
|-------|------------|-----------|
| `workspaceId` | `workspace.id` | CASCADE |
| `vendorId` | `vendor.id` | RESTRICT |
| `projectId` | `project.id` | SET NULL |
| `createdById` | `user.id` | (no action) |
| `approvedById` | `user.id` | (no action) |
| `materialId` | `material.id` | RESTRICT |
| `unitId` | `unit.id` | RESTRICT |
| `indentItemId` | `indent_item.id` | SET NULL |

### Unique Constraints

- `poNumber` - Globally unique across all workspaces

### Required Fields

**PurchaseOrder:**
- `poNumber`, `workspaceId`, `vendorId`, `totalAmount`, `currency`, `status`, `createdById`

**PurchaseOrderItem:**
- `purchaseOrderId`, `materialId`, `unitId`, `orderedQuantity`, `unitPrice`, `lineTotal`

---

## 🚫 Business Constraints

### Cannot Create PO If:
- ❌ User is not workspace member
- ❌ Vendor doesn't exist or is inactive
- ❌ Project (if specified) doesn't belong to workspace
- ❌ No items provided
- ❌ Indent items are not APPROVED
- ❌ Indent items missing vendor or price

### Cannot Approve PO If:
- ❌ Status is not DRAFT
- ❌ No items in PO
- ❌ Total amount doesn't match sum of line items
- ❌ User is not OWNER/ADMIN

### Cannot Edit PO If:
- ❌ Status is APPROVED, CANCELLED, or CLOSED
- ❌ User is not creator (for MEMBER role)

### Cannot Delete PO If:
- ❌ Status is APPROVED or CLOSED (must cancel first)
- ❌ Has linked deliveries (future)

---

## 📊 Status Transitions

### Valid Transitions

```typescript
const validTransitions: Record<POStatus, POStatus[]> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['CLOSED', 'CANCELLED'],
  CANCELLED: [], // Terminal state
  CLOSED: []     // Terminal state
};
```

### Transition Rules

| From | To | Condition |
|------|-----|-----------|
| DRAFT → APPROVED | Has items, totals match, user is OWNER/ADMIN |
| DRAFT → CANCELLED | User is OWNER/ADMIN/MEMBER (own) |
| APPROVED → CLOSED | All items received (future), user is OWNER/ADMIN |
| APPROVED → CANCELLED | User is OWNER/ADMIN, reason provided |

---

## 🔍 Query Patterns

### List POs
```typescript
// By workspace
where: { workspaceId }

// By status
where: { workspaceId, status: 'APPROVED' }

// By vendor
where: { workspaceId, vendorId }

// By project
where: { workspaceId, projectId }

// By date range
where: { 
  workspaceId, 
  createdAt: { gte: startDate, lte: endDate } 
}
```

### Aggregate Queries
```typescript
// Total PO value by vendor
groupBy: ['vendorId']
_sum: { totalAmount: true }

// PO count by status
groupBy: ['status']
_count: { id: true }
```

---

## 🎨 UI Guidelines

### PO Number Display
- Format: `PO-YYYY-NNNN` (e.g., PO-2026-0001)
- Always display in monospace font
- Link to PO detail page

### Status Badge Colors
- **DRAFT**: Gray/Neutral
- **APPROVED**: Green/Success
- **CANCELLED**: Red/Destructive
- **CLOSED**: Blue/Info

### Amount Display
- Always show currency symbol (₹, $, etc.)
- Format with thousand separators (e.g., ₹1,23,456.78)
- Align right in tables

### Date Display
- Created: Relative (e.g., "2 days ago")
- Approved: Absolute (e.g., "Jan 21, 2026")

---

## 🧪 Testing Scenarios

### Happy Path
1. ✅ Create PO from approved indent items
2. ✅ Verify total calculation
3. ✅ Approve PO
4. ✅ Close PO (future)

### Error Cases
1. ❌ Create PO with unapproved indent items → Error
2. ❌ Approve PO without items → Error
3. ❌ Approve PO with mismatched total → Error
4. ❌ Edit approved PO → Error
5. ❌ Non-member creates PO → Unauthorized

### Edge Cases
1. 🔄 Create PO without project (projectId = null)
2. 🔄 Cancel PO in DRAFT status
3. 🔄 Cancel PO in APPROVED status
4. 🔄 Multiple POs for same vendor
5. 🔄 PO with single item
6. 🔄 PO with 100+ items

---

## 📝 Common Queries

### Get PO with full details
```typescript
db.purchaseOrder.findUnique({
  where: { id },
  include: {
    vendor: true,
    project: true,
    createdBy: { select: { name: true, email: true } },
    approvedBy: { select: { name: true, email: true } },
    items: {
      include: {
        material: true,
        unit: true,
        indentItem: { include: { indentDetails: true } }
      }
    }
  }
});
```

### Get POs pending approval
```typescript
db.purchaseOrder.findMany({
  where: {
    workspaceId,
    status: 'DRAFT',
    items: { some: {} } // Has items
  },
  include: {
    vendor: true,
    createdBy: true,
    _count: { select: { items: true } }
  }
});
```

### Get vendor's PO history
```typescript
db.purchaseOrder.findMany({
  where: { vendorId },
  select: {
    id: true,
    poNumber: true,
    totalAmount: true,
    status: true,
    createdAt: true
  },
  orderBy: { createdAt: 'desc' }
});
```

---

## 🚀 Performance Tips

1. **Always filter by workspaceId first** (indexed)
2. **Use composite indexes** for common queries:
   - `[workspaceId, status]`
   - `[workspaceId, createdAt]`
3. **Select only needed fields** (avoid `include` when listing)
4. **Paginate large result sets** (use `skip` and `take`)
5. **Cache PO counts** by status per workspace

---

## 📚 Related Documentation

- **Full Design**: `PURCHASE_ORDER_DESIGN.md`
- **Migration Guide**: `PURCHASE_ORDER_MIGRATION.md`
- **API Reference**: (To be created)
- **UI Components**: (To be created)
