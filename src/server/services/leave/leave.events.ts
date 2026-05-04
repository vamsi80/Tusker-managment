import { recordActivity } from "@/lib/audit";
import prisma from "@/lib/db";

export class LeaveEvents {
    static async emitLeaveRequested(userId: string, workspaceId: string, leaveRequest: any) {
        const user = await prisma.user.findUnique({ 
            where: { id: userId }, 
            select: { surname: true } 
        });
        
        await recordActivity({
            userId,
            userName: user?.surname || "Member",
            workspaceId,
            action: "LEAVE_REQUESTED",
            entityType: "LEAVE_REQUEST",
            entityId: leaveRequest.id,
            newData: leaveRequest,
            broadcastEvent: "team_update",
        });
    }

    static async emitLeaveStatusUpdated(actorId: string, workspaceId: string, leaveRequest: any, status: "APPROVED" | "REJECTED") {
        const actor = await prisma.user.findUnique({ 
            where: { id: actorId }, 
            select: { surname: true } 
        });

        await recordActivity({
            userId: actorId,
            userName: actor?.surname || "Admin",
            workspaceId,
            action: status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
            entityType: "LEAVE_REQUEST",
            entityId: leaveRequest.id,
            newData: leaveRequest,
            broadcastEvent: "team_update",
        });
    }
}
