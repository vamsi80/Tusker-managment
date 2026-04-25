import { cache } from "react";
import prisma from "@/lib/db";

/**
 * Fetches attendance-specific thresholds for a workspace (Team Settings)
 */
export const getAttendanceSettings = cache(async (workspaceId: string) => {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                lateThreshold: true,
                overtimeThreshold: true,
            }
        });

        return workspace || {
            lateThreshold: "09:40",
            overtimeThreshold: "19:00",
        };
    } catch (error) {
        console.error("Error fetching attendance settings:", error);
        return {
            lateThreshold: "09:40",
            overtimeThreshold: "19:00",
        };
    }
});
