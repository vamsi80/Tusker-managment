import { recordActivity } from "@/lib/audit";
import { getDb } from "@/lib/registry";

export class LeaveEvents {
    private static async getInvolvedUsers(workspaceId: string, requesterMemberId: string) {
        // 1. Get the requester's user ID and their reporting manager's user ID
        const requester = await getDb().workspaceMember.findUnique({
            where: { id: requesterMemberId },
            select: { 
                userId: true, 
                reportTo: { select: { userId: true } } 
            }
        });

        // 2. Get all Owners and Admins in the workspace
        const admins = await getDb().workspaceMember.findMany({
            where: {
                workspaceId,
                workspaceRole: { in: ["OWNER", "ADMIN"] }
            },
            select: { userId: true }
        });

        const targetUserIds = new Set<string>();
        if (requester?.userId) targetUserIds.add(requester.userId);
        if (requester?.reportTo?.userId) targetUserIds.add(requester.reportTo.userId);
        admins.forEach(a => targetUserIds.add(a.userId));

        return Array.from(targetUserIds);
    }

    static async emitLeaveRequested(userId: string, workspaceId: string, leaveRequest: any) {
        const user = await getDb().user.findUnique({ 
            where: { id: userId }, 
            select: { surname: true } 
        });
        
        const targetUserIds = await this.getInvolvedUsers(workspaceId, leaveRequest.workspaceMemberId);

        await recordActivity(getDb(), {
            userId,
            userName: user?.surname || "Member",
            workspaceId,
            action: "LEAVE_REQUESTED",
            entityType: "LEAVE_REQUEST",
            entityId: leaveRequest.id,
            newData: leaveRequest,
            broadcastEvent: "team_update",
            targetUserIds,
        });
    }

    static async emitLeaveStatusUpdated(actorId: string, workspaceId: string, leaveRequest: any, status: "APPROVED" | "REJECTED") {
        const actor = await getDb().user.findUnique({ 
            where: { id: actorId }, 
            select: { surname: true } 
        });

        const targetUserIds = await this.getInvolvedUsers(workspaceId, leaveRequest.workspaceMemberId);

        await recordActivity(getDb(), {
            userId: actorId,
            userName: actor?.surname || "Admin",
            workspaceId,
            action: status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
            entityType: "LEAVE_REQUEST",
            entityId: leaveRequest.id,
            newData: leaveRequest,
            broadcastEvent: "team_update",
            targetUserIds,
        });
    }
}
