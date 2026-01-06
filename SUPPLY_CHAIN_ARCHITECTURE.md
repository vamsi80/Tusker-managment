# Architecture Proposal: "Process vs. Registry" Strategy

You have clarified the specific split you want:
1.  **Folder A:** Material (Inventory) + Vendors
2.  **Folder B:** Procurement

This is a valid "Process vs. Data" separation pattern.

## The Naming Solution: "Resources"

**Recommendation:** Name the first folder **`Resources`**.

**Why?**
*   **Procurement** is the *Process* (The "Verb" - Buying).
*   **Resources** are the *Entities* (The "Nouns" - The Goods and The Suppliers).
*   It is semantically correct: Your *Resources* include both your *Stock* (Inventory) and your *Partners* (Vendors).

## The Structure

### 1. The `Procurement` Folder (The Workflow)
This is where the *action* happens.
*   **Path:** `/w/[id]/procurement/`
*   **Tabs:**
    *   `Requests` (Indents)
    *   `Orders` (POs)
    *   `Invoices` (Bills)

### 2. The `Resources` Folder (The Library)
This is where your *data* lives.
*   **Path:** `/w/[id]/resources/` (Renamed from `material`)
*   **Tabs:**
    *   **`Inventory`** (Your physical materials)
    *   **`Vendors`** (Your suppliers)
    *   **`Catalog`** (Optional: Master list of item definitions)

## Why this is "Top 1%" Design
This architecture cleanly separates **Transactional Data** from **Master Data**.
*   **Transactional:** "I am buying X from Y" -> *Procurement*
*   **Master:** "Who is Y? What is X?" -> *Resources*

This is highly scalable because:
*   When you need to update a Vendor's phone number, you go to `Resources`.
*   When you need to approve a $50k purchase, you go to `Procurement`.
*   The permissions often align (Admin manages Resources; Managers manage Procurement).
