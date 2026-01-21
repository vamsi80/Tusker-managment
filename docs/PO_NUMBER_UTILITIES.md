# Purchase Order Utilities - Documentation

## Overview

The `src/lib/po-utils.ts` file contains utility functions for managing Purchase Order numbers in the Tusker Management System.

## PO Number Format

**Format**: `WT/YYYY-YYYY/NNNNNN`

**Example**: `WT/2025-2026/000001`

### Components:
- **Prefix**: `WT/` (Workspace/Tenant identifier)
- **Year Range**: `YYYY-YYYY` (Current year - Next year)
- **Sequence**: `NNNNNN` (6-digit sequence number, zero-padded)

### Examples:
```
WT/2025-2026/000001  (First PO of 2025-2026)
WT/2025-2026/000002  (Second PO)
WT/2025-2026/000100  (100th PO)
WT/2025-2026/001000  (1000th PO)
WT/2026-2027/000001  (First PO of next year range)
```

## Functions

### `generatePONumber(workspaceId: string): Promise<string>`

Generates a unique Purchase Order number for a workspace.

**Parameters:**
- `workspaceId` (string) - The workspace ID

**Returns:**
- `Promise<string>` - The generated PO number

**Example:**
```typescript
import { generatePONumber } from '@/lib/po-utils';

const poNumber = await generatePONumber('workspace-123');
// Returns: "WT/2025-2026/000001"
```

**How it works:**
1. Gets current year and calculates next year
2. Creates year range string (e.g., "2025-2026")
3. Queries database for last PO with matching prefix
4. Increments sequence number
5. Returns formatted PO number

**Year Rollover:**
- When calendar year changes (e.g., Jan 1, 2026), the year range automatically updates to "2026-2027"
- Sequence resets to 1 for the new year range

---

### `parsePONumber(poNumber: string): { yearRange: string; sequence: number } | null`

Parses a PO number and extracts its components.

**Parameters:**
- `poNumber` (string) - The PO number to parse

**Returns:**
- Object with `yearRange` and `sequence`, or `null` if invalid

**Example:**
```typescript
import { parsePONumber } from '@/lib/po-utils';

const parsed = parsePONumber('WT/2025-2026/000123');
// Returns: { yearRange: '2025-2026', sequence: 123 }

const invalid = parsePONumber('INVALID-PO');
// Returns: null
```

---

### `isValidPONumber(poNumber: string): boolean`

Validates if a PO number matches the expected format.

**Parameters:**
- `poNumber` (string) - The PO number to validate

**Returns:**
- `boolean` - True if valid, false otherwise

**Example:**
```typescript
import { isValidPONumber } from '@/lib/po-utils';

isValidPONumber('WT/2025-2026/000001');  // true
isValidPONumber('WT/2025-2026/123');     // false (not 6 digits)
isValidPONumber('PO-2025-0001');         // false (wrong format)
```

## Usage in Server Actions

The `generatePONumber` function is used in the `createPurchaseOrder` server action:

```typescript
// src/actions/procurement/create-purchase-order.ts
import { generatePONumber } from '@/lib/po-utils';

export async function createPurchaseOrder(workspaceId: string, data: CreatePOInput) {
    // ... validation code ...
    
    // Generate PO number
    const poNumber = await generatePONumber(workspaceId);
    
    // Create PO with generated number
    const purchaseOrder = await db.purchaseOrder.create({
        data: {
            poNumber,
            // ... other fields ...
        },
    });
    
    // ...
}
```

## Database Considerations

### Uniqueness
- PO numbers are enforced as unique at the database level via `@unique` constraint
- The `generatePONumber` function queries for the last PO to ensure sequential numbering
- Race conditions are handled by database constraints

### Indexing
- The `poNumber` field is indexed for fast lookups
- Queries use `startsWith` for efficient prefix matching

### Workspace Isolation
- PO numbers are scoped per workspace
- Each workspace has its own sequence
- Multiple workspaces can have the same sequence number (different workspace IDs)

## Testing

### Test Cases

1. **First PO of Year Range**
   ```typescript
   // No existing POs
   const poNumber = await generatePONumber('workspace-1');
   expect(poNumber).toBe('WT/2025-2026/000001');
   ```

2. **Sequential POs**
   ```typescript
   // After creating WT/2025-2026/000001
   const poNumber = await generatePONumber('workspace-1');
   expect(poNumber).toBe('WT/2025-2026/000002');
   ```

3. **Year Rollover**
   ```typescript
   // On Jan 1, 2026
   const poNumber = await generatePONumber('workspace-1');
   expect(poNumber).toBe('WT/2026-2027/000001');
   ```

4. **Multiple Workspaces**
   ```typescript
   const po1 = await generatePONumber('workspace-1');
   const po2 = await generatePONumber('workspace-2');
   // Both can be 000001 (different workspaces)
   ```

5. **Parse Valid PO**
   ```typescript
   const parsed = parsePONumber('WT/2025-2026/000123');
   expect(parsed).toEqual({ yearRange: '2025-2026', sequence: 123 });
   ```

6. **Validate PO Format**
   ```typescript
   expect(isValidPONumber('WT/2025-2026/000001')).toBe(true);
   expect(isValidPONumber('INVALID')).toBe(false);
   ```

## Migration from Old Format

If you had POs with the old format (`PO-2026-0001`), they will continue to work. The new format only applies to newly created POs.

To migrate old PO numbers (optional):
```sql
-- This is optional and should be done carefully
UPDATE purchase_order
SET po_number = CONCAT(
    'WT/',
    SUBSTRING(po_number, 4, 4), '-', 
    CAST(CAST(SUBSTRING(po_number, 4, 4) AS INTEGER) + 1 AS TEXT),
    '/',
    LPAD(SUBSTRING(po_number, 9), 6, '0')
)
WHERE po_number LIKE 'PO-%';
```

## Future Enhancements

Potential improvements:
1. **Custom Prefix**: Allow workspaces to configure their own prefix
2. **Financial Year**: Support financial year ranges (e.g., Apr 2025 - Mar 2026)
3. **Branch/Location**: Add branch/location code (e.g., `WT/MUM/2025-2026/000001`)
4. **PO Type**: Different prefixes for different PO types (e.g., `WT-SRV` for services)

## Related Files

- `src/lib/po-utils.ts` - Utility functions
- `src/actions/procurement/create-purchase-order.ts` - Server action using utilities
- `prisma/schema.prisma` - PurchaseOrder model definition
- `docs/PURCHASE_ORDER_DESIGN.md` - Complete PO module design

## Support

For questions or issues with PO number generation:
1. Check the PO number format matches `WT/YYYY-YYYY/NNNNNN`
2. Verify workspace ID is correct
3. Check database for existing POs with similar numbers
4. Review server logs for generation errors
