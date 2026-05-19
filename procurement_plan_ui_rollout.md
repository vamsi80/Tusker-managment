# Procurement Module — UI, Edge Cases, Rollout & Tests

## Codebase Context
- App Router: `src/app/w/[workspaceId]/p/[projectSlug]/` — project pages
- Task detail: sheet/drawer opened from task list (existing SubTask sheet pattern)
- UI libs: Shadcn/ui + Tailwind (existing), no new dependencies needed
- Data fetching: client components use `fetch("/api/v1/...")` with `c.get("user")` auth via cookies
- Zod schemas defined inline in routes (see `tasks.ts` pattern)

---

## UI Component Tree

```
TaskDetailSheet                     [existing — Server Component]
  └── ProcurementTab                [Client Component — lazy mounted on tab click]
        ├── if no indent:
        │   └── ProcurementEmptyState
        │         └── CreateIndentButton → CreateIndentDialog
        │               [fields: name, description, expectedDelivery]
        │
        └── if indent exists:
              ├── IndentHeader
              │     ├── IndentIdBadge        ("IND-2026-05-0001")
              │     ├── IndentStatusBadge    (colored by status)
              │     ├── SubmitButton         (DRAFT only, own indent)
              │     ├── RequestApprovalBtn   (SUBMITTED, PROCUREMENT role)
              │     └── ApproveButton        (FINAL_APPROVAL_PENDING, ADMIN/OWNER/MANAGER)
              │
              ├── IndentWorkflowStepper     [visual progress bar — 6 stages]
              │
              ├── LineItemsSection          [DRAFT/SUBMITTED only — editable]
              │     ├── AddLineItemForm
              │     │     [materialName text input, description?, unit text, quantity int,
              │     │      estimatedUnitPrice? in paise]
              │     └── LineItemTable
              │           └── LineItemRow (per item)
              │                 ├── StatusBadge
              │                 ├── QuotesButton → VendorQuoteSheet (slide-over)
              │                 │     ├── SuggestedVendorBanner
              │                 │     │     "Vendors who supply [materialName]:"
              │                 │     │     [sorted by similarity score, exact match first]
              │                 │     ├── QuoteList
              │                 │     │     └── QuoteCard
              │                 │     │           ├── "Supplied before" badge (from capability)
              │                 │     │           ├── ApproveQuoteButton
              │                 │     │           └── RejectQuoteButton
              │                 │     └── SendRFQForm
              │                 │           [vendor multi-select pre-filled from suggestions,
              │                 │            deadline picker]
              │                 └── RemoveLineItemButton (DRAFT only)
              │
              └── POSection                 [shown after FINAL_APPROVED]
                    ├── GeneratePOButton    [triggers vendor consolidation]
                    │     └── POAddressForm (per vendor)
                    └── POList
                          └── POCard (per PO)
                                ├── POHeader (poNumber, vendor, status, total)
                                ├── POLineItemsTable
                                ├── POActionButtons
                                │     ├── SendPOButton
                                │     ├── MarkShippedButton
                                │     └── MarkDeliveredButton
                                ├── PaymentSection
                                │     ├── PaymentHistory
                                │     └── RecordPaymentForm (ACCOUNTS role)
                                └── InspectionSection
                                      ├── RecordInspectionForm
                                      └── DamageClaimForm (shown if DAMAGED)
```

### Vendor Detail Page — new tab

```
VendorDetailPage
  └── MaterialCapabilitiesTab        [PROCUREMENT role only for add/remove]
        ├── CapabilityList
        │     └── CapabilityRow
        │           ├── materialName
        │           ├── unit
        │           ├── SourceBadge   (MANUAL | AUTO)
        │           └── RemoveButton  (PROCUREMENT)
        └── AddCapabilityForm
              [materialName text, unit? text]
              → POST /api/v1/procurement/vendors/:id/capabilities
```

---

## State Ownership

| Component | Owns | How Fetched |
|-----------|------|-------------|
| `ProcurementTab` | `indent` (full with lineItems) | `useEffect → fetch("/api/v1/procurement/indents/task/:taskId?w=...")` on mount |
| `VendorQuoteSheet` | `quotes[]` for one lineItem | Lazy fetch on sheet open |
| `POSection` | `pos[]` | `useEffect → fetch("/api/v1/procurement/po?w=&indentId=...")` |
| `RecordPaymentForm` | local form state | POST mutation → re-fetch PO |

**RSC / Client split:**
- `TaskDetailSheet` stays Server Component — passes `task.id` and `workspaceId` as props
- `ProcurementTab` is `"use client"` — all data fetching is client-side to keep RSC payload lean
- No `useQuery` library needed — plain `fetch` with `useState`/`useEffect` matches existing patterns

---

## Key UI States per Workflow Stage

| Status | UI Shown |
|--------|----------|
| No indent | Empty state + "Create Indent" button |
| `DRAFT` | Add/remove line items, Submit button |
| `SUBMITTED` | Read-only items, RFQ actions per item, Request Approval button |
| `FINAL_APPROVAL_PENDING` | Read-only, Approve/Reject buttons (role-gated) |
| `FINAL_APPROVED` | Generate PO button |
| `PO_GENERATED` | PO cards with send/payment/delivery/inspect actions |
| `CANCELLED` | Red cancelled banner, read-only |

---

## Edge Cases & Handling

### 1. Vendor submits quote after deadline
`QuoteService.submitQuote` checks `rfqDeadline < new Date()` → throws `AppError.ValidationError("Quote deadline has passed")` (HTTP 400). Quote is not saved.

### 2. All quotes rejected — re-RFQ
`QuoteService.rejectAllAndReopenRFQ(lineItemId)`:
1. Sets all existing quotes to `EXPIRED`
2. Transitions line item `QUOTES_RECEIVED → RFQ_SENT`
3. Procurement officer picks new/additional vendors + new deadline

### 3. PO partially delivered
`POLineItem.deliveredQty` tracks partials. At inspection, procurement records result. PO only moves to `CLOSED` when `deliveredQty === orderedQty` AND result is `PASS`. A second `markDelivered` can be called for subsequent shipments — inspections are additive.

### 4. Duplicate vendor quote for same line item
`@@unique([lineItemId, vendorId])` on `VendorQuote` catches this at DB level. Service catches Prisma `P2002` error and throws `AppError.Conflict("This vendor has already submitted a quote for this item")` (HTTP 409).

### 5. Indent cancelled mid-flow
`IndentService.cancelIndent` runs in `prisma.$transaction`:
1. Check no line item has `status === "PO_LINKED"` → throw Conflict if so
2. `updateMany` line items to `CANCELLED`
3. `updateMany` open quotes to `EXPIRED`
4. Update indent to `CANCELLED` with `cancelReason`

### 6. Payment before PO sent
`POService.recordPayment` checks `po.status === "DRAFT"` → throws `AppError.ValidationError("PO must be sent to vendor before recording payments")`.

---

## 6-Phase Rollout

### Phase 1 — Schema + Migrations (M | 3 days)
- Add enums, all new models, triggers SQL
- `pnpm prisma migrate dev --name procurement_module_phase1`
- **Test:** migrate succeeds, trigger fires on INSERT, `indentId` auto-populated

### Phase 2 — Repository + Service + Utils (L | 1 week)
- `IndentRepository`, `PORepository`, `VendorQuoteRepository`, `VendorRepository`
- `IndentService`, `RFQService`, `QuoteService`, `POService`, `InspectionService`
- `state-machine.ts`, `vendor-consolidation.ts`
- **Test:** Vitest unit tests (see below)
- **Deps:** Phase 1

### Phase 3 — API Routes (M | 3 days)
- `procurement-indents.ts`, `procurement-vendors.ts`, `procurement-po.ts`
- Register in `src/hono/index.ts`
- **Test:** Each route with curl/Postman; test 400/403/409 cases
- **Deps:** Phase 2

### Phase 4 — Core UI: Indent + Line Items (M | 4 days)
- `ProcurementTab`, `CreateIndentDialog`, `IndentHeader`, `IndentWorkflowStepper`
- `AddLineItemForm`, `LineItemTable`, `LineItemRow`
- **Test:** Create task → tag PROCUREMENT → create indent → add items → submit
- **Deps:** Phase 3

### Phase 5 — RFQ → Quote → Approval UI (M | 4 days)
- `SendRFQForm`, `VendorQuoteSheet`, `QuoteCard`, `ApproveQuoteButton`
- `RequestApprovalButton`, `ApproveButton` (role-gated)
- **Test:** Send RFQ → submit 2 quotes → approve one → other auto-rejected → admin approves indent
- **Deps:** Phase 4

### Phase 6 — PO → Payment → Delivery UI (L | 5 days)
- `GeneratePOButton`, `POCard`, `POLineItemsTable`
- `RecordPaymentForm`, `PaymentHistory`
- `RecordInspectionForm`, `DamageClaimForm`
- **Test:** Generate PO → send → record advance → mark delivered → inspect (DAMAGED) → damage claim
- **Deps:** Phase 5

---

## Vitest Test Cases

```ts
// state-machine.test.ts
describe("IndentStatus transitions", () => {
  test("DRAFT → SUBMITTED is valid")
  test("DRAFT → FINAL_APPROVAL_PENDING is invalid — throws ValidationError")
  test("DRAFT → CANCELLED is valid")
  test("FINAL_APPROVED → SUBMITTED is invalid")
  test("PO_GENERATED → any state is invalid")
  test("CANCELLED → any state is invalid")
})

describe("LineItemStatus transitions", () => {
  test("PENDING → VENDOR_IDENTIFIED is valid")
  test("PENDING → QUOTE_APPROVED is invalid")
  test("QUOTES_RECEIVED → RFQ_SENT is valid (re-RFQ flow)")
  test("PO_LINKED → any state is invalid")
})

// vendor-consolidation.test.ts
describe("groupLineItemsByVendor", () => {
  test("groups 3 items from vendor A and 2 from vendor B into 2 groups")
  test("skips items with status !== QUOTE_APPROVED")
  test("skips items with no approvedQuote")
  test("returns empty Map when no approved items")
})

describe("computePOTotals", () => {
  test("calculates subtotal correctly for multiple items")
  test("applies SGST + CGST correctly at 18% total")
  test("handles items with 0% tax")
})

// vendor.repository.test.ts // NEW
describe("VendorRepository.findSuggestedVendors", () => {
  test("returns empty array when no capability matches materialName")
  test("excludes BLACKLISTED vendors from suggestions")
  test("excludes inactive vendors (isActive=false) from suggestions")
  test("returns results sorted by similarity score descending")
  test("only returns results with similarity > 0.4")
  test("exact match (similarity=1.0) appears first")
})

// quote.service.test.ts // NEW
describe("QuoteService.approveQuote (capability side-effect)", () => {
  test("auto-upserts VendorMaterialCapability with source AUTO on approval")
  test("duplicate capability upsert is idempotent — no error thrown")
  test("normalizes materialName to lowercase trim before upsert")
  test("does not create capability for REJECTED quote")
})

// vendor.service.test.ts // NEW
describe("VendorService.addCapability", () => {
  test("normalizes materialName to lowercase trim before insert")
  test("throws Conflict on duplicate capability for same vendor")
  test("sets source as MANUAL")
})

// indent.service.test.ts
describe("IndentService.createIndent", () => {
  test("throws Conflict when task already has an indent")
  test("throws Forbidden when user is not a workspace member")
  test("creates indent with DRAFT status")
})

describe("IndentService.finalApprove", () => {
  test("OWNER role can approve")
  test("ADMIN role can approve")
  test("MANAGER role can approve")
  test("PROCUREMENT role cannot approve — throws Forbidden")
  test("MEMBER role cannot approve — throws Forbidden")
})

describe("IndentService.cancelIndent", () => {
  test("cancels indent in DRAFT state")
  test("cancels indent in SUBMITTED state")
  test("throws Conflict when a line item is PO_LINKED")
  test("cascades CANCELLED to all eligible line items in transaction")
  test("expires all SUBMITTED/UNDER_REVIEW quotes in transaction")
})

describe("QuoteService.submitQuote", () => {
  test("throws ValidationError when rfqDeadline is in the past")
  test("throws Conflict on second submission by same vendor (P2002)")
  test("transitions line item to QUOTES_RECEIVED on first quote submitted")
  test("does not re-transition line item on subsequent quotes")
})

describe("POService.recordPayment", () => {
  test("throws ValidationError when PO status is DRAFT")
  test("records payment when PO status is SENT")
  test("updates PO.advancePaid total correctly")
})

// DB integration test
describe("ID generation trigger", () => {
  test("indentId is null before insert, populated after")
  test("indentId format matches IND-YYYY-MM-NNNN")
  test("sequence resets on month change")
})
```
