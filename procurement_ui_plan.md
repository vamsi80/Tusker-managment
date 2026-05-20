# Procurement UI — Visual Design Plan

## Core Design Principle
The Procurement tab lives inside the **Subtask Sheet** (a right-side slide-over panel). Space is limited — we must be brutally efficient. The UI must feel like a **mini-workflow dashboard**, not a form dump.

---

## 1. The Critical Connection: Indent Items ↔ Vendor Capabilities

> **This is the most important insight in the plan.**

When a user types a `materialName` into a line item (e.g. `"TMT Steel 10mm"`), the system should:

1. **Auto-suggest vendors** who have `VendorMaterialCapability` matching that material (trigram similarity ≥ 0.4 via `pg_trgm`).
2. **Show a "Supplied Before" badge** on vendors in the RFQ panel — sourced from `VendorRepository.hasSuppliedBefore()`.
3. When a quote is **approved** → `RFQService.approveQuote()` **auto-upserts** the capability back (source: `AUTO`), so the vendor's profile grows over time.

This creates a **feedback loop**:
```
materialName typed
    → VendorRepository.findSuggestedVendors()  [similarity search]
        → Show suggested vendors in RFQ sheet
            → User sends RFQ to suggested vendor
                → Vendor submits quote
                    → Quote approved
                        → VendorMaterialCapability auto-upserted (source: AUTO)
                            → Next time the material is typed → vendor appears again
```

The UI must **surface this connection at the right moment** (when the user clicks "Send RFQ" on a line item).

---

## 2. Screen Layout — Procurement Tab Zones

```
┌─────────────────────────────────────────────────────┐
│  ZONE A: Indent Header (always visible)             │
│  ┌──────────────────────────────────────────────┐   │
│  │ IND-2026-05-0001  [DRAFT]  Name of indent    │   │
│  │                            [Submit] [Cancel] │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ZONE B: Workflow Stepper (always visible)          │
│  ●──────○──────○──────○                             │
│  Draft  Submit Assign Approve                       │
│                                                     │
│  ZONE C: Line Items Table (scrollable)             │
│  ┌──────────────────────────────────────────────┐   │
│  │ Material      Unit  Qty  Est.₹   Status  RFQ │   │
│  │ TMT Steel 10  kg    500  ₹65     PENDING  [→] │   │
│  │ Cement 53G    bags  200  ₹380    RFQ_SENT    │   │
│  │ [+ Add material...]                           │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ZONE D: RFQ Side Panel (slide-in, per line item)  │
│  Opens when user clicks [→] on a line item         │
└─────────────────────────────────────────────────────┘
```

---

## 3. Component Tree (Final)

```
ProcurementTab                          [orchestrator, fetches indent by taskId]
  │
  ├── [No indent] → CreateIndentForm
  │       Header section:   name, description, expectedDelivery
  │       Line items grid:  materialName, unit, qty, est.₹  [dynamic rows]
  │       Actions:          [Create Indent →]
  │
  └── [Indent exists] →
        ├── IndentHeader
        │     ├── IndentIdBadge         "IND-2026-05-0001"
        │     ├── IndentStatusBadge     colored by status
        │     ├── IndentMeta            requestedBy, expectedDelivery
        │     └── IndentActions        [Submit] [Approve] [Cancel] — role/status gated
        │
        ├── IndentWorkflowStepper       4-step progress indicator
        │
        ├── LineItemsSection
        │     ├── LineItemTable
        │     │     └── LineItemRow (per item)
        │     │           ├── materialName + specs
        │     │           ├── unit, qty, est.₹
        │     │           ├── LineItemStatusBadge
        │     │           ├── VendorMatchPill         ← NEW: "3 vendors match"
        │     │           ├── [→ RFQ] button          opens RfqSheet
        │     │           └── [✕] delete (DRAFT only)
        │     │
        │     └── InlineAddRow          (DRAFT only — last row of table)
        │
        └── RfqSheet                    [Sheet/Drawer slide-in from right]
              ├── RfqSheetHeader        materialName, qty, current status
              │
              ├── SuggestedVendorList   ← CONNECTS to VendorCapabilities
              │     "Vendors who can supply this material"
              │     └── SuggestedVendorCard (per vendor, sorted by similarity)
              │           ├── VendorName + CompanyName
              │           ├── SimilarityBar           visual match %
              │           ├── SuppliedBeforeBadge     green ✓ | gray –
              │           ├── PerformanceScore        based on past quote approvals
              │           └── [Select for RFQ] checkbox
              │
              ├── SendRfqForm           (status: PENDING or re-RFQ)
              │     ├── Selected vendors list (from checkboxes above)
              │     ├── Deadline date picker
              │     └── [Send RFQ →] button
              │
              └── QuoteList             (status: RFQ_SENT or QUOTES_RECEIVED)
                    └── QuoteCard (per vendor quote)
                          ├── VendorName
                          ├── SuppliedBeforeBadge     ← from VendorRepository
                          ├── unitPrice, qty, totalPrice, leadTime
                          ├── validUntil, notes
                          ├── QuoteStatusBadge
                          └── [✓ Approve] [✗ Reject] — role gated
```

---

## 4. The VendorMatchPill — New Component

**Purpose:** Give a quick visual hint on the line item row that vendor suggestions exist, without requiring the user to open the RFQ sheet.

```
┌──────────────────────────────────────────────────────────────┐
│  TMT Steel 10mm  │ kg │ 500 │ ₹65/kg │ [PENDING] │ 🏢 3 │ [→]│
└──────────────────────────────────────────────────────────────┘
                                              ↑
                                     VendorMatchPill
                              "3 vendors match this material"
                              (fetched lazily when indent opens)
```

**Data:** `GET /api/v1/procurement/indents/:id/items/:itemId/suggested-vendors?w=` already exists. The pill just shows the `count` of results.

**Behavior:**
- Shows a small building/store icon + count badge
- Gray = no vendors found (tooltip: "No vendors found for this material")
- Green = vendors matched
- Clicking opens `RfqSheet` pre-loaded with suggestions

---

## 5. RFQ Sheet — Detailed Layout

```
┌─────────────────────────────────────────────────┐
│  ← Back   RFQ: TMT Steel 10mm                  │
│           500 kg  |  Est. ₹32,500  |  [PENDING] │
├─────────────────────────────────────────────────┤
│  SUGGESTED VENDORS  (3 match)                   │
│                                                 │
│  ☐  Shree Steel Traders          ████████░ 87%  │
│     Company: Shree Trading Co.   ✓ Supplied     │
│     Performance: 94%  (past 12 quotes)          │
│                                                 │
│  ☐  Ravi Iron Works              ██████░░░ 71%  │
│     Company: Ravi Enterprises    ✓ Supplied     │
│     Performance: 78%                           │
│                                                 │
│  ☐  New Vendor Ltd               ████░░░░░ 52%  │
│     Company: New Ventures        – Never        │
│     Performance: –  (no history)               │
│                                                 │
├─────────────────────────────────────────────────┤
│  SEND RFQ                                       │
│  Selected: Shree Steel, Ravi Iron Works (2)     │
│  Deadline: [  20-Jun-2026  ]                   │
│            [     Send RFQ →     ]               │
└─────────────────────────────────────────────────┘
```

**When RFQ_SENT / QUOTES_RECEIVED**, the sheet transforms:
```
┌─────────────────────────────────────────────────┐
│  ← Back   Quotes: TMT Steel 10mm               │
│           500 kg  |  [QUOTES_RECEIVED]          │
├─────────────────────────────────────────────────┤
│  QUOTES RECEIVED (2 of 2 vendors)              │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Shree Steel Traders     ✓ Supplied       │   │
│  │ ₹68/kg × 500 = ₹34,000                 │   │
│  │ Lead: 7 days  | Valid: 30-Jun-2026      │   │
│  │ Note: "Incl. delivery to site"          │   │
│  │                [✓ Approve] [✗ Reject]   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Ravi Iron Works         ✓ Supplied       │   │
│  │ ₹71/kg × 500 = ₹35,500                 │   │
│  │ Lead: 10 days | Valid: 25-Jun-2026      │   │
│  │                [✓ Approve] [✗ Reject]   │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 6. Status-Driven UI Gating Table

| Indent Status | Line Item Actions | Indent Actions |
|---|---|---|
| `DRAFT` | Add row, delete row, edit (inline) | Submit, Cancel |
| `SUBMITTED` | Open RFQ sheet (read-only items), Send RFQ | Cancel |
| `ASSIGNED` | Open RFQ sheet, Send RFQ, view quotes | Approve (Admin/Owner/Manager), Cancel |
| `APPROVED` | View quotes only | — |
| `CANCELLED` | Read-only banner | — |

| Line Item Status | RFQ Sheet Shows |
|---|---|
| `PENDING` | Suggested vendors + Send RFQ form |
| `RFQ_SENT` | "Awaiting quotes..." + deadline countdown |
| `QUOTES_RECEIVED` | Quote cards with Approve/Reject buttons |
| `APPROVED` | Approved quote summary (winner card) |
| `REJECTED` | Rejected reason badge |

---

## 7. Color System for Procurement

| State | Background | Text | Border |
|---|---|---|---|
| DRAFT | `gray-50/50` | `gray-600` | `gray-200/50` |
| SUBMITTED | `blue-50/50` | `blue-600` | `blue-200/50` |
| ASSIGNED | `purple-50/50` | `purple-600` | `purple-200/50` |
| APPROVED | `green-50/50` | `green-600` | `green-200/50` |
| CANCELLED | `red-50/50` | `red-600` | `red-200/50` |
| RFQ_SENT | `orange-50/50` | `orange-600` | `orange-200/50` |
| QUOTES_RECEIVED | `sky-50/50` | `sky-600` | `sky-200/50` |
| PO_CREATED | `violet-50/50` | `violet-600` | `violet-200/50` |

---

## 8. New Files to Build

| File | Purpose |
|---|---|
| `vendor-match-pill.tsx` | Lazy-loads suggestion count for a line item |
| `rfq-sheet.tsx` | Full RFQ slide-in panel (vendor list + send form + quotes) |
| `suggested-vendor-card.tsx` | One vendor card inside RfqSheet |
| `send-rfq-form.tsx` | Deadline picker + send action |
| `quote-card.tsx` | One vendor quote with approve/reject |
| `quote-list.tsx` | Renders all quotes for a line item |

> **Reuse already built:**
> - `SuppliedBeforeBadge` → `src/components/procurement/supplied-before-badge.tsx` ✓
> - `IndentHeader`, `IndentWorkflowStepper`, `LineItemTable`, `ProcurementTab` ✓

---

## 9. API Calls Needed (already exist)

| Action | Endpoint |
|---|---|
| Fetch indent by task | `GET /indents/task/:taskId?w=` |
| Get indent full detail | `GET /indents/:id?w=` |
| Get suggested vendors | `GET /indents/:id/items/:itemId/suggested-vendors?w=` |
| Send RFQ to vendors | `POST /rfq/send` (needs building) |
| Submit quote | `POST /rfq/quotes` (needs building) |
| Approve quote | `POST /rfq/quotes/:id/approve` (needs building) |
| Reject quote | `POST /rfq/quotes/:id/reject` (needs building) |

---

## 10. Build Order (Phased)

### Phase A — Vendor Connection (this week)
1. `vendor-match-pill.tsx` — add to each `LineItemRow`
2. `rfq-sheet.tsx` — skeleton with `SuggestedVendorCard` list
3. `send-rfq-form.tsx` — inside RfqSheet
4. Add `POST /procurement/rfq/send` Hono route
5. Wire up `RFQService.sendRFQ()`

### Phase B — Quote Flow (next week)
1. `quote-card.tsx` + `quote-list.tsx`
2. Add `POST /procurement/rfq/quotes` Hono route
3. Add `POST /procurement/rfq/quotes/:id/approve` + reject routes
4. Wire `RFQService.approveQuote()` → capability auto-upsert

### Phase C — Polish
1. Deadline countdown badge on line items with `RFQ_SENT` status
2. "Re-send RFQ" when all quotes are rejected
3. Approved quote winner card inside RfqSheet

---

## 11. Key Design Decisions

**Q: Should RFQ be a Sheet or a Dialog?**
A: **Sheet (slide-in from right).** The main Subtask Sheet is already a slide-over; using a nested Sheet that slides in from within is a natural extension. Dialogs feel abrupt and interrupt context.

**Q: Where does the vendor list come from in RFQ?**
A: `GET /indents/:id/items/:itemId/suggested-vendors` — called when the RfqSheet mounts for that `itemId`. Not pre-fetched. Keep it lazy.

**Q: Should capability connection be visible to users?**
A: Yes — via `SuppliedBeforeBadge` and the similarity bar. Users should understand *why* a vendor is suggested. This builds trust in the system's intelligence.

**Q: What if no vendors match?**
A: Show "No matching vendors found" + a text field to manually add a vendor by name/email for one-time RFQ. This prevents the workflow from blocking.
