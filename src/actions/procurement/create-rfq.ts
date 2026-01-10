"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

interface CreateRfqParams {
    workspaceId: string;
    itemIds: string[]; // IndentItem IDs
    vendorIds: string[];
    deadline?: Date;
}

export async function createRfq({ workspaceId, itemIds, vendorIds, deadline }: CreateRfqParams) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return { error: "Unauthorized" };
        }

        const permissions = await getWorkspacePermissions(workspaceId);
        if (!permissions.workspaceMember) {
            return { error: "Access denied" };
        }

        // Generate Key
        const lastRfq = await db.rfq.findFirst({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });

        let nextNum = 1;
        if (lastRfq?.key) {
            const parts = lastRfq.key.split("-");
            const num = parseInt(parts[parts.length - 1]);
            if (!isNaN(num)) nextNum = num + 1;
        }
        const key = `RFQ-${nextNum.toString().padStart(3, '0')}`;

        // Fetch items to get quantities
        const indentItems = await db.indentItem.findMany({
            where: { id: { in: itemIds } }
        });

        await db.rfq.create({
            data: {
                key,
                workspaceId,
                deadline,
                status: "OPEN",
                vendors: {
                    connect: vendorIds.map(id => ({ id }))
                },
                items: {
                    create: indentItems.map(item => ({
                        indentItemId: item.id,
                        quantity: item.quantity
                    }))
                }
            }
        });

        revalidatePath(`/w/${workspaceId}/procurement/rfq`);
        return { success: true };
    } catch (e) {
        console.error("Error creating RFQ:", e);
        return { error: "Failed to create RFQ" };
    }
}
