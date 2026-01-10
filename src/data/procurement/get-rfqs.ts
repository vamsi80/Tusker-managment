"use server";

import db from "@/lib/db";

export async function getRfqs(workspaceId: string) {
    try {
        const rfqs = await db.rfq.findMany({
            where: { workspaceId },
            include: {
                vendors: {
                    select: { id: true, name: true, companyName: true }
                },
                _count: {
                    select: { items: true, quotations: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return rfqs;
    } catch (error) {
        console.error("Error fetching RFQs:", error);
        return [];
    }
}

export type RfqWithRelations = Awaited<ReturnType<typeof getRfqs>>[number];
