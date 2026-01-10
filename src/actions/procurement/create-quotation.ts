"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

interface CreateQuotationParams {
    rfqId: string;
    vendorId: string;
    items: {
        rfqItemId: string;
        unitPrice: number;
    }[];
    workspaceId: string; // for revalidation path
}

export async function createQuotation({ rfqId, vendorId, items, workspaceId }: CreateQuotationParams) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return { error: "Unauthorized" };
        }

        // Upsert quotation
        await db.quotation.upsert({
            where: {
                rfqId_vendorId: {
                    rfqId,
                    vendorId
                }
            },
            create: {
                rfqId,
                vendorId,
                items: {
                    create: items.map(item => ({
                        rfqItemId: item.rfqItemId,
                        unitPrice: item.unitPrice
                    }))
                }
            },
            update: {
                items: {
                    deleteMany: {},
                    create: items.map(item => ({
                        rfqItemId: item.rfqItemId,
                        unitPrice: item.unitPrice
                    }))
                }
            }
        });

        revalidatePath(`/w/${workspaceId}/procurement/rfq/${rfqId}`);
        return { success: true };
    } catch (e) {
        console.error("Error creating quotation:", e);
        return { error: "Failed to save quotation" };
    }
}
