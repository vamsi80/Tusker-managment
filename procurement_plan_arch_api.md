# Procurement Module — Architecture & API (Production-Ready)

## Actual Project Structure Patterns
- Services: `src/server/services/<domain>/` with files: `index.ts`, `<domain>.service.ts`, `<domain>.repository.ts`, `<domain>.mapper.ts`, `<domain>.events.ts`
- Routes: `src/hono/routes/<domain>.ts` — registered in `src/hono/index.ts`
- DB: `import prisma from "@/lib/db"` (PrismaClient from `@/generated/prisma/client`)
- Errors: `AppError.NotFound()`, `AppError.Forbidden()`, `AppError.Conflict()`, `AppError.ValidationError()` from `@/lib/errors/app-error`
- Permissions: `getWorkspacePermissions(workspaceId, userId)` from `@/data/user/get-user-permissions`
- Auth: `c.get("user")` gives `User` (Better Auth) from `HonoVariables` — no workspaceMemberId, must resolve separately
- Zod schemas: defined inline in routes (see `tasks.ts`) or in `@/lib/zodSchemas`
- Classes use `static` methods (no instances): `TaskRepository`, `TasksService`, `TaskMapper`, `TaskEvents`
- Events class: cache invalidation + `recordActivity()` from `@/lib/audit` — fire in background with `.catch()`

---

## Folder Structure (mirrors existing task/project domains)

```
src/server/services/procurement/
  index.ts                     ← exports all classes
  indent.service.ts            ← IndentService (static methods)
  indent.repository.ts         ← IndentRepository (static methods, Prisma only)
  indent.mapper.ts             ← IndentMapper (pure transforms)
  indent.events.ts             ← IndentEvents (cache + recordActivity)
  rfq.service.ts               ← RFQService
  quote.service.ts             ← QuoteService
  quote.repository.ts          ← VendorQuoteRepository
  po.service.ts                ← POService
  po.repository.ts             ← PORepository
  po.mapper.ts                 ← POMapper
  po.events.ts                 ← POEvents
  vendor.service.ts            ← VendorService
  vendor.repository.ts         ← VendorRepository
  inspection.service.ts        ← InspectionService
  utils/
    state-machine.ts           ← transition maps + assertTransition()
    vendor-consolidation.ts    ← groupLineItemsByVendor(), computePOTotals()

src/hono/routes/
  procurement-indents.ts       ← indent + line-item routes
  procurement-vendors.ts       ← vendor routes
  procurement-po.ts            ← PO + payment + inspection routes
```

Register in `src/hono/index.ts`:
```ts
import procurementIndents from "./routes/procurement-indents";
import procurementVendors from "./routes/procurement-vendors";
import procurementPO from "./routes/procurement-po";

app.route("/procurement/indents", procurementIndents);
app.route("/procurement/vendors", procurementVendors);
app.route("/procurement/po", procurementPO);
```

---

## Repository Pattern (mirrors TaskRepository)

```ts
// src/server/services/procurement/indent.repository.ts
import "server-only";
import prisma from "@/lib/db";

export class IndentRepository {
  static async findById(id: string) {
    return prisma.indent.findUnique({
      where: { id },
      include: {
        lineItems: { include: { material: true, unit: true, vendorQuotes: true } },
        requestedBy: { include: { user: { select: { id: true, name: true, surname: true } } } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, name: true, taskSlug: true } },
      },
    });
  }

  static async findByTaskId(taskId: string) {
    return prisma.indent.findUnique({ where: { taskId } });
  }

  static async findMany(workspaceId: string, filter: { projectId?: string; status?: string; page?: number }) {
    const take = 20;
    const skip = ((filter.page || 1) - 1) * take;
    return prisma.indent.findMany({
      where: {
        workspaceId,
        ...(filter.projectId && { projectId: filter.projectId }),
        ...(filter.status && { status: filter.status as any }),
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true, indentId: true, name: true, status: true, createdAt: true,
        requestedBy: { include: { user: { select: { surname: true } } } },
        _count: { select: { lineItems: true } },
      },
    });
  }

  static async create(data: any) {
    return prisma.indent.create({ data });
  }

  static async updateStatus(id: string, status: any, extra?: any, tx?: any) {
    const client = tx || prisma;
    return client.indent.update({ where: { id }, data: { status, ...extra } });
  }

  static async findWorkspaceMember(userId: string, workspaceId: string) {
    return prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true, workspaceRole: true },
    });
  }
}
```

```ts
// src/server/services/procurement/po.repository.ts
import "server-only";
import prisma from "@/lib/db";

export class PORepository {
  static async findById(id: string) {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        lineItems: { include: { material: true, unit: true } },
        vendor: true,
        payments: true,
        inspections: { include: { damageClaims: true } },
        createdBy: { include: { user: { select: { id: true, surname: true } } } },
      },
    });
  }

  static async findMany(workspaceId: string, filter: { vendorId?: string; status?: string; page?: number }) {
    const take = 20;
    const skip = ((filter.page || 1) - 1) * take;
    return prisma.purchaseOrder.findMany({
      where: {
        workspaceId,
        ...(filter.vendorId && { vendorId: filter.vendorId }),
        ...(filter.status && { status: filter.status as any }),
      },
      orderBy: { createdAt: "desc" },
      take, skip,
      select: {
        id: true, poNumber: true, status: true, totalAmount: true, advancePaid: true,
        createdAt: true, vendor: { select: { id: true, name: true } },
        _count: { select: { lineItems: true } },
      },
    });
  }

  static async create(data: any, tx?: any) {
    const client = tx || prisma;
    return client.purchaseOrder.create({ data });
  }

  static async updateStatus(id: string, status: any, extra?: any, tx?: any) {
    const client = tx || prisma;
    return client.purchaseOrder.update({ where: { id }, data: { status, ...extra } });
  }
}
```

---

## Service Pattern (mirrors ProjectService/TasksService)

```ts
// src/server/services/procurement/indent.service.ts
import { AppError } from "@/lib/errors/app-error";
import { IndentRepository } from "./indent.repository";
import { IndentEvents } from "./indent.events";
import { INDENT_TRANSITIONS, assertTransition } from "./utils/state-machine";

export class IndentService {
  static async createIndent(data: {
    taskId: string; projectId: string; workspaceId: string;
    name: string; description?: string; expectedDelivery?: Date;
  }, userId: string) {
    const existing = await IndentRepository.findByTaskId(data.taskId);
    if (existing) throw AppError.Conflict("An indent already exists for this task");

    const member = await IndentRepository.findWorkspaceMember(userId, data.workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    const indent = await IndentRepository.create({
      ...data,
      requestedById: member.id,
      status: "DRAFT",
    });
    IndentEvents.onIndentCreated({ indentId: indent.id, workspaceId: data.workspaceId, userId }).catch(
      (e) => console.error("[INDENT_EVENTS] create failed:", e)
    );
    return indent;
  }

  static async submitIndent(indentId: string, userId: string, workspaceId: string) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");
    assertTransition(INDENT_TRANSITIONS, indent.status, "SUBMITTED", "Indent");

    const updated = await IndentRepository.updateStatus(indentId, "SUBMITTED", { submittedAt: new Date() });
    IndentEvents.onIndentSubmitted({ indentId, workspaceId, userId }).catch(
      (e) => console.error("[INDENT_EVENTS] submit failed:", e)
    );
    return updated;
  }

  static async finalApprove(indentId: string, userId: string, workspaceId: string) {
    const member = await IndentRepository.findWorkspaceMember(userId, workspaceId);
    if (!member) throw AppError.Forbidden("Not a workspace member");

    const allowed: string[] = ["OWNER", "ADMIN", "MANAGER"];
    if (!allowed.includes(member.workspaceRole)) throw AppError.Forbidden("Insufficient permissions to approve indent");

    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");
    assertTransition(INDENT_TRANSITIONS, indent.status, "FINAL_APPROVED", "Indent");

    return IndentRepository.updateStatus(indentId, "FINAL_APPROVED", {
      finalApprovedAt: new Date(),
      finalApprovedById: member.id,
    });
  }

  static async cancelIndent(indentId: string, reason: string, userId: string, workspaceId: string) {
    const indent = await IndentRepository.findById(indentId);
    if (!indent) throw AppError.NotFound("Indent not found");

    const hasPOLinked = indent.lineItems.some((li: any) => li.status === "PO_LINKED");
    if (hasPOLinked) throw AppError.Conflict("Cannot cancel: some line items are already linked to a PO. Cancel the PO first.");

    assertTransition(INDENT_TRANSITIONS, indent.status, "CANCELLED", "Indent");

    await prisma.$transaction(async (tx) => {
      await tx.indentLineItem.updateMany({
        where: { indentId, status: { in: ["PENDING","VENDOR_IDENTIFIED","RFQ_SENT","QUOTES_RECEIVED"] } },
        data: { status: "CANCELLED" },
      });
      await tx.vendorQuote.updateMany({
        where: { lineItem: { indentId }, status: { in: ["SUBMITTED","UNDER_REVIEW"] } },
        data: { status: "EXPIRED" },
      });
      await tx.indent.update({
        where: { id: indentId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
      });
    });
  }
}
```

---

## State Machine Utils

```ts
// src/server/services/procurement/utils/state-machine.ts
import { AppError } from "@/lib/errors/app-error";

export const INDENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT:                  ["SUBMITTED", "CANCELLED"],
  SUBMITTED:              ["FINAL_APPROVAL_PENDING", "CANCELLED"],
  FINAL_APPROVAL_PENDING: ["FINAL_APPROVED", "SUBMITTED"],
  FINAL_APPROVED:         ["PO_GENERATED"],
  PO_GENERATED:           [],
  CANCELLED:              [],
};

export const LINE_ITEM_TRANSITIONS: Record<string, string[]> = {
  PENDING:           ["VENDOR_IDENTIFIED", "CANCELLED"],
  VENDOR_IDENTIFIED: ["RFQ_SENT", "CANCELLED"],
  RFQ_SENT:          ["QUOTES_RECEIVED", "CANCELLED"],
  QUOTES_RECEIVED:   ["QUOTE_APPROVED", "RFQ_SENT"],
  QUOTE_APPROVED:    ["PO_LINKED"],
  PO_LINKED:         [],
  CANCELLED:         [],
};

export const PO_TRANSITIONS: Record<string, string[]> = {
  DRAFT:       ["SENT", "CANCELLED"],
  SENT:        ["ADVANCE_PAID", "SHIPPED"],
  ADVANCE_PAID:["SHIPPED"],
  SHIPPED:     ["DELIVERED"],
  DELIVERED:   ["INSPECTED"],
  INSPECTED:   ["CLOSED"],
  CLOSED:      [],
  CANCELLED:   [],
};

export function assertTransition(map: Record<string, string[]>, from: string, to: string, entity: string) {
  if (!map[from]?.includes(to)) {
    throw AppError.ValidationError(`${entity} cannot transition from ${from} to ${to}`);
  }
}
```

---

## Events Pattern (mirrors TaskEvents)

```ts
// src/server/services/procurement/indent.events.ts
import { recordActivity } from "@/lib/audit";

export class IndentEvents {
  static async onIndentCreated(opts: { indentId: string; workspaceId: string; userId: string }) {
    try {
      await recordActivity({
        userId: opts.userId,
        userName: "",
        workspaceId: opts.workspaceId,
        action: "INDENT_CREATED",
        entityType: "INDENT",
        entityId: opts.indentId,
        broadcastEvent: "team_update",
        targetUserIds: [],
      });
    } catch (e) {
      console.error("[INDENT_EVENTS] onIndentCreated failed:", e);
    }
  }

  static async onIndentSubmitted(opts: { indentId: string; workspaceId: string; userId: string }) {
    // same pattern — recordActivity with INDENT_SUBMITTED action
  }
}
```

---

## API Route Pattern (mirrors src/hono/routes/tasks.ts)

```ts
// src/hono/routes/procurement-indents.ts
import { Hono } from "hono";
import { z } from "zod";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { IndentService } from "@/server/services/procurement/indent.service";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

const router = new Hono<{ Variables: HonoVariables }>();

const createIndentSchema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(3).max(200),
  description: z.string().optional(),
  expectedDelivery: z.string().datetime().optional(),
});

router.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createIndentSchema.safeParse(body);
  if (!parsed.success) throw AppError.ValidationError("Invalid indent data");

  const indent = await IndentService.createIndent(parsed.data, user.id);
  return c.json({ success: true, data: indent });
});

router.get("/task/:taskId", async (c) => {
  const taskId = c.req.param("taskId");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  const { IndentRepository } = await import("@/server/services/procurement/indent.repository");
  const indent = await IndentRepository.findByTaskId(taskId);
  return c.json({ success: true, data: indent });
});

router.post("/:id/submit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { workspaceId } = await c.req.json();
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId");

  const result = await IndentService.submitIndent(id, user.id, workspaceId);
  return c.json({ success: true, data: result });
});

router.post("/:id/approve", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { workspaceId } = await c.req.json();

  const result = await IndentService.finalApprove(id, user.id, workspaceId);
  return c.json({ success: true, data: result });
});

router.post("/:id/cancel", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { workspaceId, reason } = await c.req.json();
  if (!reason) throw AppError.ValidationError("Cancellation reason required");

  await IndentService.cancelIndent(id, reason, user.id, workspaceId);
  return c.json({ success: true, message: "Indent cancelled" });
});

export default router;
```

---

## Full API Route Table

### Indent Routes (`/api/v1/procurement/indents`)
| Method | Path | Who Can Call | Body/Query |
|--------|------|--------------|------------|
| POST | `/` | Any workspace member | `createIndentSchema` |
| GET | `/` | Any member | `?w=&projectId=&status=&page=` |
| GET | `/:id` | Any member | — |
| GET | `/task/:taskId` | Any member | `?w=` |
| PATCH | `/:id` | Requestor or ADMIN/OWNER | partial fields |
| POST | `/:id/submit` | Requestor or ADMIN | `{ workspaceId }` |
| POST | `/:id/request-approval` | PROCUREMENT/ADMIN | `{ workspaceId }` |
| POST | `/:id/approve` | OWNER/ADMIN/MANAGER | `{ workspaceId }` |
| POST | `/:id/cancel` | OWNER/ADMIN | `{ workspaceId, reason }` |

### Line Item Routes (`/api/v1/procurement/indents/:id/items`) // UPDATED
| Method | Path | Who Can Call | Body |
|--------|------|--------------|------|
| POST | `/:id/items` | PROCUREMENT/ADMIN | `{ materialName, description?, unit, quantity, estimatedUnitPrice? }` |
| PATCH | `/:id/items/:itemId` | PROCUREMENT/ADMIN | partial fields |
| DELETE | `/:id/items/:itemId` | PROCUREMENT/ADMIN | — |
| GET | `/:id/items/:itemId/suggested-vendors` | PROCUREMENT | `?w=` — returns ranked vendor list via pg_trgm |
| POST | `/:id/items/:itemId/rfq` | PROCUREMENT | `{ vendorIds[], deadline }` |
| POST | `/:id/items/:itemId/reopen-rfq` | PROCUREMENT/ADMIN | `{ vendorIds[], deadline }` |

### Quote Routes (`/api/v1/procurement/quotes`)
| Method | Path | Who Can Call | Body |
|--------|------|--------------|------|
| POST | `/` | PROCUREMENT (or vendor token) | `{ lineItemId, vendorId, unitPrice, quantity, ... }` |
| GET | `/line-item/:itemId` | PROCUREMENT/ADMIN | — |
| POST | `/:id/approve` | PROCUREMENT/ADMIN | `{ lineItemId }` |
| POST | `/:id/reject` | PROCUREMENT/ADMIN | `{ reason }` |

### Vendor Routes (`/api/v1/procurement/vendors`) // UPDATED
| Method | Path | Who Can Call | Body/Query |
|--------|------|--------------|------------|
| POST | `/` | ADMIN/PROCUREMENT | `CreateVendorSchema` |
| GET | `/` | Any member | `?w=&search=&isActive=` |
| PATCH | `/:id` | ADMIN | partial fields |
| DELETE | `/:id` | OWNER/ADMIN | — (soft delete: `isActive=false`) |
| GET | `/:id/capabilities` | PROCUREMENT/ADMIN | — returns `VendorMaterialCapability[]` |
| POST | `/:id/capabilities` | PROCUREMENT | `{ materialName: string, unit?: string }` — normalized to lowercase trim |
| DELETE | `/:id/capabilities/:capId` | PROCUREMENT/ADMIN | — |

### PO Routes (`/api/v1/procurement/po`)
| Method | Path | Who Can Call | Body/Query |
|--------|------|--------------|------------|
| POST | `/` | OWNER/ADMIN | `GeneratePOSchema` |
| GET | `/` | Any member | `?w=&vendorId=&status=&page=` |
| GET | `/:id` | Any member | — |
| POST | `/:id/send` | ADMIN/PROCUREMENT | `{ workspaceId }` |
| POST | `/:id/payment` | ACCOUNTS/ADMIN | `RecordPaymentSchema` |
| POST | `/:id/shipped` | PROCUREMENT | `{ workspaceId }` |
| POST | `/:id/delivered` | PROCUREMENT | `{ workspaceId }` |
| POST | `/:id/inspect` | PROCUREMENT/MANAGER | `RecordInspectionSchema` |
| POST | `/:id/damage-claim` | PROCUREMENT/MANAGER | `CreateDamageClaimSchema` |

---

## Role & Permission Matrix

| Action | OWNER | ADMIN | MANAGER | PROCUREMENT | ACCOUNTS | MEMBER |
|--------|-------|-------|---------|-------------|----------|--------|
| Create Indent | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Submit Indent | ✅ | ✅ | ✅ | ✅ | ❌ | Own only |
| Add Line Items | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Send RFQ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Submit Quote | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Approve Quote | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Final Approve Indent | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Generate PO | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Send PO | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Record Payment | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Mark Delivered | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Record Inspection | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create Damage Claim | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Vendors | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Manage Vendor Capabilities | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |

---

## Suggested Vendor Endpoint Logic // NEW

`GET /api/v1/procurement/indents/:id/items/:itemId/suggested-vendors?w=<workspaceId>`

**Response shape:**
```ts
{
  success: true,
  data: [
    {
      vendor: { id, name, companyName, email, phoneNumber, isActive },
      similarityScore: 0.87,           // pg_trgm score 0–1
      capabilityMatchedOn: "tmt steel", // the capability name that matched
      isExactMatch: true,               // similarity === 1.0
    }
  ]
}
```

**Route implementation pattern** (in `procurement-indents.ts`):
```ts
router.get("/:id/items/:itemId/suggested-vendors", async (c) => {
  const itemId = c.req.param("itemId");
  const workspaceId = c.req.query("w");
  if (!workspaceId) throw AppError.ValidationError("Missing workspaceId (w)");

  // 1. Fetch the line item to get materialName
  const { IndentLineItemRepository } = await import("@/server/services/procurement/indent.repository");
  const item = await IndentLineItemRepository.findById(itemId);
  if (!item) throw AppError.NotFound("Line item not found");

  // 2. Run pg_trgm suggestion query
  const { VendorRepository } = await import("@/server/services/procurement/vendor.repository");
  const raw = await VendorRepository.findSuggestedVendors(workspaceId, item.materialName);

  // 3. Enrich with full vendor data
  const result = await VendorRepository.enrichSuggestions(raw);
  return c.json({ success: true, data: result });
});
```

**Auto-upsert capability on quote approval** (in `QuoteService.approveQuote`):
```ts
// After approving the quote, build capability registry organically
await prisma.vendorMaterialCapability.upsert({
  where: { vendorId_materialName: { vendorId: quote.vendorId, materialName: item.materialName.toLowerCase().trim() } },
  update: {},  // already exists — no-op
  create: {
    vendorId: quote.vendorId,
    materialName: item.materialName.toLowerCase().trim(),
    unit: item.unit,
    workspaceId,
    source: "AUTO",
  },
});
```

Permission check in every route (same as tasks.ts):
```ts
const perms = await getWorkspacePermissions(workspaceId, user.id);
// perms.workspaceRole === "PROCUREMENT" || perms.isWorkspaceAdmin
if (perms.workspaceRole !== "PROCUREMENT" && !perms.isWorkspaceAdmin) {
  throw AppError.Forbidden("Insufficient permissions");
}
```
