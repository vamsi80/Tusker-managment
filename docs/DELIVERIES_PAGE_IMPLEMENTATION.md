# Deliveries Page Implementation Guide

## ✅ What's Been Created

I've created the complete Deliveries page structure with the same design pattern as the PO page:

### Files Created:

1. **`src/app/w/[workspaceId]/procurement/deliveries/page.tsx`**
   - Server component that fetches data
   - Passes data to client component

2. **`src/app/w/[workspaceId]/procurement/deliveries/_components/client.tsx`**
   - Client component with DataTable
   - Flattens PO items for display
   - Includes filters for PO Status and Delivery Status

3. **`src/app/w/[workspaceId]/procurement/deliveries/_components/columns.tsx`**
   - Column definitions for the table
   - Shows: PO Number, Material, Vendor, Project, Quantities, Prices, Statuses
   - Includes "Record Delivery" action button

## 📊 Table Columns

| Column | Description |
|--------|-------------|
| **PO Number** | PO number + date |
| **Material** | Material name + unit |
| **Vendor** | Vendor name with icon |
| **Project** | Project name |
| **Ordered** | Ordered quantity |
| **Delivered** | Delivered / Ordered (with %) |
| **Unit Price** | Price per unit |
| **Total** | Total amount |
| **PO Status** | Draft/Pending/Approved/Completed/Cancelled |
| **Delivery** | Pending/Partial/Delivered |
| **Expected** | Expected delivery date |
| **Actions** | "Record Delivery" button |

## 🎨 Features

✅ **Same Design as PO Page**:
- DataTable with search
- Filter menu for statuses
- Badge colors for different statuses
- Icons for visual clarity

✅ **Delivery Tracking**:
- Shows ordered vs delivered quantities
- Percentage completion
- Delivery status badges

✅ **Action Buttons**:
- "Record Delivery" button for each item
- Ready for delivery dialog implementation

## ⚠️ Prerequisites

### 1. Database Schema Must Include PO Models

The deliveries page expects these models in `prisma/schema.prisma`:

```prisma
model PurchaseOrder {
  id                  String   @id @default(uuid())
  poNumber            String   @unique
  workspaceId         String
  vendorId            String
  projectId           String
  subtotalAmount      Decimal  @default(0)
  totalTaxAmount      Decimal  @default(0)
  totalAmount         Decimal
  status              POStatus @default(DRAFT)
  expectedDeliveryDate DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  
  vendor              Vendor   @relation(fields: [vendorId], references: [id])
  project             Project  @relation(fields: [projectId], references: [id])
  workspace           Workspace @relation(fields: [workspaceId], references: [id])
  items               PurchaseOrderItem[]
  
  @@map("purchase_order")
}

model PurchaseOrderItem {
  id                String  @id @default(uuid())
  purchaseOrderId   String
  materialId        String
  unitId            String
  orderedQuantity   Float
  deliveredQuantity Float   @default(0)
  unitPrice         Decimal
  sgstPercent       Decimal?
  cgstPercent       Decimal?
  lineTotal         Decimal
  taxAmount         Decimal @default(0)
  totalAmount       Decimal
  deliveryStatus    DeliveryStatus @default(PENDING)
  indentItemId      String?
  
  purchaseOrder     PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  material          Material @relation(fields: [materialId], references: [id])
  unit              Unit @relation(fields: [unitId], references: [id])
  indentItem        IndentItem? @relation(fields: [indentItemId], references: [id])
  
  @@map("purchase_order_item")
}

enum POStatus {
  DRAFT
  PENDING
  APPROVED
  COMPLETED
  CANCELLED
}

enum DeliveryStatus {
  PENDING
  PARTIAL
  DELIVERED
}
```

### 2. Run Migration

```bash
npx prisma migrate dev --name add_purchase_orders
```

### 3. Create Data Fetching Function

Create `src/data/procurement/get-purchase-orders.ts`:

```typescript
import db from "@/lib/db";

export async function getPurchaseOrders(workspaceId: string) {
    return await db.purchaseOrder.findMany({
        where: { workspaceId },
        include: {
            vendor: {
                select: {
                    id: true,
                    name: true,
                },
            },
            project: {
                select: {
                    id: true,
                    name: true,
                },
            },
            items: {
                include: {
                    material: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    unit: {
                        select: {
                            id: true,
                            abbreviation: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}
```

### 4. Update Deliveries Page

Update `src/app/w/[workspaceId]/procurement/deliveries/page.tsx`:

```typescript
import { getPurchaseOrders } from "@/data/procurement/get-purchase-orders";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { DeliveriesClientPage } from "./_components/client";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function DeliveriesPage({ params }: PageProps) {
    const { workspaceId } = await params;

    const [purchaseOrders, workspaceMembersResult] = await Promise.all([
        getPurchaseOrders(workspaceId),
        getWorkspaceMembers(workspaceId),
    ]);

    return (
        <DeliveriesClientPage
            data={purchaseOrders}
            userRole={workspaceMembersResult.workspaceMembers[0]?.workspaceRole || 'MEMBER'}
            workspaceId={workspaceId}
        />
    );
}
```

## 🎯 Current Status

✅ **Complete**:
- Page structure created
- Client component with DataTable
- Column definitions with all fields
- Filters for statuses
- Same design as PO page

⏳ **Pending** (requires migration):
- Database schema migration
- Data fetching function
- Actual PO data display

📝 **Future Enhancements**:
- Record Delivery dialog
- Delivery history
- Partial delivery support
- Delivery notes/photos
- Vendor signature
- Quality check integration

## 🧪 Testing (After Migration)

1. **Create some POs** from the PO page
2. **Navigate to Deliveries** page
3. **Verify**:
   - ✅ All PO items are displayed
   - ✅ Material names and quantities shown
   - ✅ Vendor and project information visible
   - ✅ Delivery status badges working
   - ✅ Filters functioning
   - ✅ Search working
   - ✅ "Record Delivery" button present

## 📖 Next Steps

1. **Run database migration** to add PO models
2. **Create `get-purchase-orders.ts`** data fetching function
3. **Update deliveries page** to use real data
4. **Test with actual POs**
5. **Implement "Record Delivery" dialog**

## 🎨 Visual Preview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Deliveries                                                                  │
│ Track and manage purchase order deliveries                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search materials...          [Filters ▼] [Columns ▼]                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ PO Number    │ Material  │ Vendor │ Project │ Ordered │ Delivered │ Actions│
├─────────────────────────────────────────────────────────────────────────────┤
│ WT/25-26/001 │ 📦 Cement │ 🚚 ABC │ Bldg A  │ 100 bags│ 50/100    │ [Record]│
│ 21 Jan, 2026 │   bags    │ Supply │         │         │ 50%       │ Delivery│
├─────────────────────────────────────────────────────────────────────────────┤
│ WT/25-26/001 │ 📦 Steel  │ 🚚 ABC │ Bldg A  │ 50 tons │ 0/50      │ [Record]│
│ 21 Jan, 2026 │   tons    │ Supply │         │         │ 0%        │ Delivery│
└─────────────────────────────────────────────────────────────────────────────┘
```

✅ The Deliveries page is ready! Just need to run the migration and connect the data! 🚀
