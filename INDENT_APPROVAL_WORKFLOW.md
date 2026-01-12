# 2-Step Indent Approval Workflow Implementation

## Overview
Implemented a dynamic 2-step approval workflow for indent items with **automatic approval for admins**:

### For Project Leads:
1. **Without Vendor**: Lead creates indent → Admin approves quantity → Lead adds vendor → Admin gives final approval
2. **With Vendor**: Lead creates indent with vendor → Admin approves quantity → Admin gives final approval

### For Admins (Auto-Approval):
1. **With Vendor + Price**: Admin creates indent → **Automatically APPROVED** ✓
2. **Without Vendor**: Admin creates indent → **Automatically QUANTITY_APPROVED** → Admin adds vendor → **Automatically APPROVED** ✓

## Database Schema Changes

### IndentItem Model Updates
Added the following fields to `IndentItem`:

```prisma
// Approval workflow fields
status                IndentItemStatus  @default(PENDING)
quantityApproved      Boolean           @default(false)
quantityApprovedBy    String?           // WorkspaceMember ID
quantityApprovedAt    DateTime?
finalApproved         Boolean           @default(false)
finalApprovedBy       String?           // WorkspaceMember ID
finalApprovedAt       DateTime?
rejectionReason       String?

// New relations
quantityApprover      WorkspaceMember?  @relation("quantity_approver")
finalApprover         WorkspaceMember?  @relation("final_approver")
```

### New Enum: IndentItemStatus
```prisma
enum IndentItemStatus {
  PENDING              // Initial state - awaiting quantity approval
  QUANTITY_APPROVED    // Quantity approved, waiting for vendor details
  VENDOR_PENDING       // Vendor added, waiting for final approval
  APPROVED             // Fully approved
  REJECTED             // Rejected by admin
}
```

## Workflow State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  PENDING (created by lead)                                  │
│    │                                                         │
│    ├─→ Admin approves quantity                              │
│    │   └─→ QUANTITY_APPROVED (if no vendor)                 │
│    │       └─→ Lead adds vendor + price                     │
│    │           └─→ VENDOR_PENDING                            │
│    │               └─→ Admin approves final                  │
│    │                   └─→ APPROVED ✓                        │
│    │                                                         │
│    └─→ Admin approves (if vendor exists)                    │
│        └─→ APPROVED ✓                                        │
│                                                             │
│  Any state → Admin rejects → REJECTED ✗                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Server Actions

### File: `src/actions/procurement/approve-indent-item.ts`

1. **`approveQuantity(itemId, workspaceId)`**
   - Admin-only action
   - Approves the quantity of an indent item
   - Moves status to `QUANTITY_APPROVED` or `VENDOR_PENDING` (if vendor exists)
   - Records approver and timestamp

2. **`approveFinal(itemId, workspaceId)`**
   - Admin-only action
   - Gives final approval (vendor + price)
   - Requires vendor and price to be set
   - Moves status to `APPROVED`
   - Records approver and timestamp

3. **`rejectIndentItem(itemId, workspaceId, reason)`**
   - Admin-only action
   - Rejects an indent item with a reason
   - Moves status to `REJECTED`

4. **`updateVendorDetails(itemId, workspaceId, vendorId, estimatedPrice)`**
   - Available to leads and admins
   - Updates vendor and price after quantity approval
   - Moves status to `VENDOR_PENDING`
   - Requires quantity to be approved first

## Utility Functions

### File: `src/lib/indent-item-status.ts`

1. **`getIndentItemStatusInfo(status)`**
   - Returns badge information for each status
   - Includes label, variant, color, and description

2. **`canApproveQuantity(status)`**
   - Checks if quantity can be approved

3. **`canApproveFinal(status, hasVendor, hasPrice)`**
   - Checks if final approval can be given

4. **`canAddVendor(status)`**
   - Checks if vendor details can be added

5. **`canReject(status)`**
   - Checks if item can be rejected

## Status Badge Colors

| Status | Color | Icon | Description |
|--------|-------|------|-------------|
| `PENDING` | 🟡 Yellow | ⏳ | Awaiting quantity approval |
| `QUANTITY_APPROVED` | 🔵 Blue | ➕ | Add vendor details |
| `VENDOR_PENDING` | 🟠 Orange | ⏳ | Awaiting final approval |
| `APPROVED` | 🟢 Green | ✓ | Fully approved |
| `REJECTED` | 🔴 Red | ✗ | Rejected |

## Next Steps

### 1. Run Database Migration
```bash
npx prisma migrate dev --name add_indent_approval_workflow
npx prisma generate
```

### 2. Update UI Components
- Add status badges to indent items table
- Add approval buttons for admins
- Add vendor update form for leads
- Show approval history/timeline

### 3. Update Create Indent Logic
- Set initial status to `PENDING`
- If vendor is provided, set status to `VENDOR_PENDING` after quantity approval

### 4. Add Notifications
- Notify admins when items need approval
- Notify leads when quantity is approved
- Notify leads when items are rejected

## Permissions Summary

| Action | Admin | Project Lead | Member |
|--------|-------|--------------|--------|
| Create Indent | ✓ | ✓ | ✗ |
| Approve Quantity | ✓ | ✗ | ✗ |
| Approve Final | ✓ | ✗ | ✗ |
| Reject Item | ✓ | ✗ | ✗ |
| Add Vendor (after quantity approval) | ✓ | ✓ | ✗ |
| View Indents | ✓ | ✓ | ✗ |

## Example Usage

### Scenario 1: Without Vendor
```typescript
// 1. Lead creates indent (no vendor)
// Status: PENDING

// 2. Admin approves quantity
await approveQuantity(itemId, workspaceId);
// Status: QUANTITY_APPROVED

// 3. Lead adds vendor details
await updateVendorDetails(itemId, workspaceId, vendorId, price);
// Status: VENDOR_PENDING

// 4. Admin gives final approval
await approveFinal(itemId, workspaceId);
// Status: APPROVED
```

### Scenario 2: With Vendor
```typescript
// 1. Lead creates indent (with vendor)
// Status: PENDING

// 2. Admin approves quantity (auto-moves to VENDOR_PENDING)
await approveQuantity(itemId, workspaceId);
// Status: VENDOR_PENDING

// 3. Admin gives final approval
await approveFinal(itemId, workspaceId);
// Status: APPROVED
```

## Files Modified/Created

### Modified:
- `prisma/schema.prisma` - Added approval fields and enum

### Created:
- `src/actions/procurement/approve-indent-item.ts` - Approval actions
- `src/lib/indent-item-status.ts` - Status utility functions
- `INDENT_APPROVAL_WORKFLOW.md` - This documentation

## Testing Checklist

- [ ] Create indent without vendor
- [ ] Admin approves quantity
- [ ] Lead adds vendor details
- [ ] Admin gives final approval
- [ ] Create indent with vendor
- [ ] Admin gives direct approval
- [ ] Admin rejects item
- [ ] Test permission checks
- [ ] Test status transitions
- [ ] Test validation rules
