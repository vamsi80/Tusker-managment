import { getDb } from "@/lib/registry";

export async function getVendors(workspaceId: string) {
    try {
        const vendors = await getDb().vendor.findMany({
            where: {
                workspaceId: workspaceId,
                isActive: true,
            },
            orderBy: {
                createdAt: "desc",
            },
            include: {
                capabilities: {
                    select: {
                        id: true,
                        materialName: true,
                    }
                }
            }
        });

        return vendors;
    } catch (error) {
        console.error("Error fetching vendors:", error);
        return [];
    }
}

export type VendorRow = Awaited<ReturnType<typeof getVendors>>[number];
