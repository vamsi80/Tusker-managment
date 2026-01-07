import prisma from "@/lib/db";
import { cache } from "react";

/**
 * Get all active units from the database
 * Cached for performance
 */
export const getUnits = cache(async () => {
    try {
        const units = await prisma.unit.findMany({
            where: {
                isActive: true,
            },
            orderBy: [
                { isDefault: 'desc' }, // Default units first
                { category: 'asc' },   // Then by category
                { name: 'asc' },       // Then alphabetically
            ],
            select: {
                id: true,
                name: true,
                abbreviation: true,
                category: true,
                isDefault: true,
            },
        });

        return units;
    } catch (error) {
        console.error("Error fetching units:", error);
        return [];
    }
});

/**
 * Get units grouped by category
 */
export const getUnitsGroupedByCategory = cache(async () => {
    const units = await getUnits();

    const grouped = units.reduce((acc, unit) => {
        const category = unit.category || "Other";
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(unit);
        return acc;
    }, {} as Record<string, typeof units>);

    return grouped;
});

/**
 * Get a single unit by ID
 */
export const getUnitById = cache(async (unitId: string) => {
    try {
        const unit = await prisma.unit.findUnique({
            where: { id: unitId },
        });

        return unit;
    } catch (error) {
        console.error("Error fetching unit:", error);
        return null;
    }
});

/**
 * Check if a unit abbreviation already exists
 */
export const checkUnitAbbreviationExists = async (abbreviation: string, excludeId?: string) => {
    try {
        const unit = await prisma.unit.findUnique({
            where: { abbreviation },
        });

        // If we're editing, exclude the current unit from the check
        if (excludeId && unit?.id === excludeId) {
            return false;
        }

        return !!unit;
    } catch (error) {
        console.error("Error checking unit abbreviation:", error);
        return false;
    }
};
