"use server";

import db from "@/lib/db";

export async function getApprovedIndentItems(workspaceId: string) {
    try {
        const approvedItems = await db.indentItem.findMany({
            where: {
                indentDetails: {
                    status: "APPROVED",
                    project: {
                        workspaceId,
                    },
                },
            },
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
                        name: true,
                        abbreviation: true,
                    },
                },
                indentDetails: {
                    select: {
                        id: true,
                        key: true,
                        name: true,
                        expectedDelivery: true,
                        project: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return approvedItems;
    } catch (error) {
        console.error("Error fetching approved indent items:", error);
        return [];
    }
}

// Type now exported from @/data/procurement
