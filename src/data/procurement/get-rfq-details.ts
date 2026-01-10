"use server";

import db from "@/lib/db";

export async function getRfqDetails(rfqId: string) {
    try {
        const rfq = await db.rfq.findUnique({
            where: { id: rfqId },
            include: {
                workspace: true,
                vendors: true,
                quotations: {
                    include: {
                        items: true
                    }
                },
                items: {
                    include: {
                        indentItem: {
                            include: {
                                material: true,
                                unit: true
                            }
                        }
                    }
                }
            }
        });
        return rfq;
    } catch (e) {
        console.error("Error fetching RFQ details:", e);
        return null;
    }
}

export type RfqDetails = NonNullable<Awaited<ReturnType<typeof getRfqDetails>>>;
