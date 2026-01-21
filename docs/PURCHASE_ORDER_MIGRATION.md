# Purchase Order Module - Migration Guide

## Overview

This guide walks you through applying the Purchase Order schema changes to your database.

## Prerequisites

- Existing Prisma schema with User, Workspace, Vendor, Project, Material, Unit, and IndentItem models
- PostgreSQL database
- Prisma CLI installed (`pnpm add -D prisma`)

## Migration Steps

### Step 1: Verify Schema Changes

The following models and enum have been added to `prisma/schema.prisma`:

1. **PurchaseOrder** model (lines 528-573)
2. **PurchaseOrderItem** model (lines 575-605)
3. **POStatus** enum (lines 611-616)

Additionally, reverse relations have been added to:
- `User` model: `createdPurchaseOrders`, `approvedPurchaseOrders`
- `Workspace` model: `purchaseOrders`
- `Vendor` model: `purchaseOrders`
- `Project` model: `purchaseOrders`
- `Material` model: `purchaseOrderItems`
- `Unit` model: `purchaseOrderItems`
- `IndentItem` model: `purchaseOrderItems`

### Step 2: Generate Migration

Run the following command to generate a migration:

```bash
pnpm prisma migrate dev --name add_purchase_order_module
```

This will:
1. Create a new migration file in `prisma/migrations/`
2. Apply the migration to your database
3. Regenerate the Prisma Client

### Step 3: Verify Migration

Check that the migration was successful:

```bash
pnpm prisma migrate status
```

Expected output:
```
Database schema is up to date!
```

### Step 4: Inspect Generated Tables

Connect to your PostgreSQL database and verify the new tables:

```sql
-- Check purchase_order table
\d purchase_order

-- Check purchase_order_item table
\d purchase_order_item

-- Check POStatus enum
SELECT enum_range(NULL::POStatus);
```

Expected tables:

**purchase_order:**
- id (uuid, primary key)
- poNumber (text, unique)
- workspaceId (uuid, foreign key → workspace.id)
- vendorId (uuid, foreign key → vendor.id)
- projectId (uuid, nullable, foreign key → project.id)
- totalAmount (decimal(15,2))
- currency (text, default 'INR')
- status (POStatus, default 'DRAFT')
- createdById (text, foreign key → user.id)
- approvedById (text, nullable, foreign key → user.id)
- createdAt (timestamp)
- approvedAt (timestamp, nullable)
- updatedAt (timestamp)

**purchase_order_item:**
- id (uuid, primary key)
- purchaseOrderId (uuid, foreign key → purchase_order.id)
- materialId (uuid, foreign key → material.id)
- unitId (uuid, foreign key → unit.id)
- orderedQuantity (decimal(15,3))
- unitPrice (decimal(15,2))
- lineTotal (decimal(15,2))
- indentItemId (uuid, nullable, foreign key → indent_item.id)
- createdAt (timestamp)
- updatedAt (timestamp)

### Step 5: Verify Indexes

Check that all indexes were created:

```sql
-- List all indexes on purchase_order
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'purchase_order';

-- List all indexes on purchase_order_item
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'purchase_order_item';
```

Expected indexes on `purchase_order`:
- `purchase_order_pkey` (id)
- `purchase_order_poNumber_key` (poNumber, unique)
- `purchase_order_workspaceId_idx`
- `purchase_order_vendorId_idx`
- `purchase_order_projectId_idx`
- `purchase_order_status_idx`
- `purchase_order_createdById_idx`
- `purchase_order_approvedById_idx`
- `purchase_order_workspaceId_status_idx` (composite)
- `purchase_order_workspaceId_createdAt_idx` (composite)

Expected indexes on `purchase_order_item`:
- `purchase_order_item_pkey` (id)
- `purchase_order_item_purchaseOrderId_idx`
- `purchase_order_item_materialId_idx`
- `purchase_order_item_indentItemId_idx`

### Step 6: Regenerate Prisma Client

Ensure the Prisma Client is up to date:

```bash
pnpm prisma generate
```

This updates the generated client in `src/generated/prisma/`.

### Step 7: Verify TypeScript Types

Create a test file to verify the types are available:

```typescript
// test/verify-po-types.ts
import { PrismaClient, POStatus } from '@/generated/prisma';

const db = new PrismaClient();

async function verifyTypes() {
  // Test POStatus enum
  const statuses: POStatus[] = ['DRAFT', 'APPROVED', 'CANCELLED', 'CLOSED'];
  console.log('✅ POStatus enum available:', statuses);

  // Test PurchaseOrder type
  const po = await db.purchaseOrder.findFirst({
    include: {
      items: true,
      vendor: true,
      project: true,
      createdBy: true,
      approvedBy: true
    }
  });
  console.log('✅ PurchaseOrder type available');

  // Test PurchaseOrderItem type
  const item = await db.purchaseOrderItem.findFirst({
    include: {
      material: true,
      unit: true,
      indentItem: true
    }
  });
  console.log('✅ PurchaseOrderItem type available');
}

verifyTypes().catch(console.error);
```

Run the test:
```bash
npx tsx test/verify-po-types.ts
```

## Rollback (If Needed)

If you need to rollback the migration:

```bash
# Rollback the last migration
pnpm prisma migrate resolve --rolled-back <migration_name>

# Or reset the database (⚠️ WARNING: This deletes all data!)
pnpm prisma migrate reset
```

## Post-Migration Tasks

### 1. Update Data Access Layer

Create data access functions for Purchase Orders:

```typescript
// src/data/purchase-orders.ts
import { db } from '@/lib/db';
import { POStatus } from '@/generated/prisma';

export async function getPurchaseOrders(workspaceId: string) {
  return await db.purchaseOrder.findMany({
    where: { workspaceId },
    include: {
      vendor: true,
      project: true,
      createdBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } },
      _count: { select: { items: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getPurchaseOrder(id: string, workspaceId: string) {
  return await db.purchaseOrder.findFirst({
    where: { id, workspaceId },
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
}
```

### 2. Create Server Actions

Implement server actions for PO operations:

```typescript
// src/actions/procurement/purchase-orders.ts
'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createPurchaseOrder(
  workspaceId: string,
  data: {
    vendorId: string;
    projectId?: string;
    indentItemIds: string[];
  }
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Validate workspace membership
  const member = await db.workspaceMember.findFirst({
    where: {
      userId: session.user.id,
      workspaceId,
      workspaceRole: { in: ['OWNER', 'ADMIN', 'MEMBER'] }
    }
  });

  if (!member) {
    throw new Error('Unauthorized');
  }

  // Implementation here...
  // See PURCHASE_ORDER_DESIGN.md for full implementation

  revalidatePath(`/w/${workspaceId}/procurement/purchase-orders`);
}
```

### 3. Add UI Components

Create UI components for PO management:

- `src/app/w/[workspaceId]/procurement/purchase-orders/page.tsx` - PO list page
- `src/app/w/[workspaceId]/procurement/purchase-orders/[poId]/page.tsx` - PO detail page
- `src/app/w/[workspaceId]/procurement/purchase-orders/_components/create-po-dialog.tsx` - Create PO dialog
- `src/app/w/[workspaceId]/procurement/purchase-orders/_components/po-table.tsx` - PO data table

### 4. Update Navigation

Add Purchase Orders to the procurement navigation:

```typescript
// src/app/w/[workspaceId]/procurement/layout.tsx
const procurementNav = [
  { name: 'Indent', href: `/w/${workspaceId}/procurement/indent` },
  { name: 'Purchase Orders', href: `/w/${workspaceId}/procurement/purchase-orders` },
  // ... other items
];
```

## Verification Checklist

After migration, verify:

- [ ] Migration applied successfully
- [ ] All tables created with correct columns
- [ ] All indexes created
- [ ] Foreign key constraints in place
- [ ] Enum values correct
- [ ] Prisma Client regenerated
- [ ] TypeScript types available
- [ ] No TypeScript errors in existing code
- [ ] Dev server runs without errors

## Troubleshooting

### Issue: Migration fails with "relation already exists"

**Solution:** The tables may already exist. Check with:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'purchase%';
```

If tables exist, you may need to:
1. Drop the tables manually
2. Re-run the migration

### Issue: TypeScript errors after migration

**Solution:** 
1. Restart TypeScript server in VSCode: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"
2. Regenerate Prisma Client: `pnpm prisma generate`
3. Restart dev server

### Issue: Foreign key constraint errors

**Solution:** Ensure all referenced records exist:
- Workspace must exist
- Vendor must exist and be active
- Project (if specified) must exist
- User (creator) must exist
- Materials and Units must exist

## Next Steps

1. ✅ Apply migration
2. ✅ Verify database schema
3. ✅ Regenerate Prisma Client
4. 🔄 Implement data access layer
5. 🔄 Create server actions
6. 🔄 Build UI components
7. 🔄 Add navigation
8. 🔄 Write tests

Refer to `PURCHASE_ORDER_DESIGN.md` for detailed implementation guidelines.
