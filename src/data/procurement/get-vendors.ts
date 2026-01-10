"use server";

import db from "@/lib/db";

export async function getVendors(workspaceId: string) {
    const vendors = await db.vendor.findMany({
        where: {
            workspaceId,
            isActive: true
        },
        select: {
            id: true,
            name: true
        },
        orderBy: { name: "asc" },
    });

    return vendors;
}
