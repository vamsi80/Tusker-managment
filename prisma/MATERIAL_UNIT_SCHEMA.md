# Material and Unit Models - Schema Documentation

## Overview
The Material and Unit models provide a structured way to manage materials and their units of measurement across the workspace.

## Models

### Unit Model
Stores all units of measurement that can be used for materials.

**Fields:**
- `id`: Unique identifier
- `name`: Full name (e.g., "Kilogram", "Meter", "Piece")
- `abbreviation`: Short form (e.g., "kg", "m", "pcs")
- `category`: Optional grouping (e.g., "Weight", "Length", "Volume", "Quantity")
- `isDefault`: Boolean flag to mark commonly used units
- `isActive`: Soft delete flag
- `createdAt`, `updatedAt`: Timestamps

**Relations:**
- `materials`: Materials using this as default unit
- `indents`: Indents using this unit

### Material Model
Stores material definitions for the workspace.

**Fields:**
- `id`: Unique identifier
- `name`: Material name (unique per workspace)
- `specifications`: Optional technical specifications/description
- `defaultUnitId`: Reference to the default unit for this material
- `workspaceId`: Reference to workspace
- `isActive`: Soft delete flag
- `createdAt`, `updatedAt`: Timestamps

**Relations:**
- `defaultUnit`: The default unit of measure
- `workspace`: The workspace this material belongs to
- `indents`: All indents using this material

### Updated Indent Model
Now references Material and Unit instead of storing strings.

**Changes:**
- `materialName` (String) → `materialId` (String) with relation to Material
- `unit` (String) → `unitId` (String) with relation to Unit

## Default Units to Seed

### Weight
- Kilogram (kg) - Default
- Gram (g)
- Ton (t)
- Pound (lb)

### Length
- Meter (m) - Default
- Centimeter (cm)
- Millimeter (mm)
- Kilometer (km)
- Foot (ft)
- Inch (in)

### Volume
- Liter (L) - Default
- Milliliter (mL)
- Cubic Meter (m³)
- Gallon (gal)

### Area
- Square Meter (m²) - Default
- Square Foot (ft²)
- Acre (ac)

### Quantity
- Piece (pcs) - Default
- Dozen (doz)
- Box (box)
- Bag (bag)
- Bundle (bdl)

### Time
- Hour (hr) - Default
- Day (day)
- Month (mo)

## Migration Steps

1. **Create Migration:**
   ```bash
   npx prisma migrate dev --name add_material_and_unit_models
   ```

2. **Seed Default Units:**
   Create a seed script at `prisma/seed-units.ts` to populate default units.

3. **Data Migration:**
   If you have existing Indent records, you'll need to:
   - Extract unique material names and units
   - Create Material and Unit records
   - Update Indent records with the new IDs

## Usage Example

```typescript
// Create a new material
const cement = await prisma.material.create({
  data: {
    name: "Portland Cement",
    specifications: "Grade 43, OPC",
    defaultUnitId: kgUnitId,
    workspaceId: workspaceId,
  }
});

// Create an indent with the material
const indent = await prisma.indent.create({
  data: {
    procurementTaskId: taskId,
    materialId: cement.id,
    unitId: bagUnitId, // Can use different unit than default
    quantity: 100,
    estimatedCost: 5000,
  }
});
```

## Benefits

1. **Data Consistency**: No typos in material names or units
2. **Reusability**: Materials can be reused across indents
3. **Flexibility**: Can add custom units per workspace need
4. **Reporting**: Easy to aggregate by material or unit
5. **Validation**: Ensure only valid units are used
