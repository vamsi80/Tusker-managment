import { recordActivity } from "../../../lib/audit";
import prisma from "@tusker/db";

export class LeaveEvents {
    private static async getInvolvedUsers(workspaceId: string, requesterMemberId: string) {
        // 1. Get the requester's user ID and their reporting manager's user ID
        const requester = await prisma.workspaceMember.findUnique({
            where: { id: requesterMemberId },
            select: {
                userId: true,
                user: { select: { name: true, surname: true } },
                reportTo: { select: { userId: true } }
            }
        });

        // 2. Get all Owners and Admins in the workspace
        const admins = await prisma.workspaceMember.findMany({
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

        return {
            targetUserIds: Array.from(targetUserIds),
            // The leave is *about* the requester, whoever approved or deleted it.
            subjectUserId: requester?.userId,
            subjectName: requester?.user?.surname || requester?.user?.name || "A member",
        };
    }

    static async emitLeaveRequested(userId: string, workspaceId: string, leaveRequest: any) {
        const user = await prisma.user.findUnique({ 
            where: { id: userId }, 
            select: { surname: true } 
        });
        
        const { targetUserIds, subjectUserId, subjectName } = await this.getInvolvedUsers(workspaceId, leaveRequest.workspaceMemberId);

        await recordActivity({
            userId,
            userName: user?.surname || "Member",
            workspaceId,
            action: "LEAVE_REQUESTED",
            entityType: "LEAVE_REQUEST",
            entityId: leaveRequest.id,
            newData: leaveRequest,
            broadcastEvent: "team_update",
            targetUserIds,
            subjectUserId,
            subjectName,
        });
    }

    /** `status` of "PENDING" means an approval was revoked. */
    static async emitLeaveStatusUpdated(actorId: string, workspaceId: string, leaveRequest: any, status: "APPROVED" | "REJECTED" | "PENDING") {
        const actor = await prisma.user.findUnique({ 
            where: { id: actorId }, 
            select: { surname: true } 
        });

        const { targetUserIds, subjectUserId, subjectName } = await this.getInvolvedUsers(workspaceId, leaveRequest.workspaceMemberId);

        await recordActivity({
            userId: actorId,
            userName: actor?.surname || "Admin",
            workspaceId,
            action:
                status === "APPROVED"
                    ? "LEAVE_APPROVED"
                    : status === "PENDING"
                        ? "LEAVE_APPROVAL_REVOKED"
                        : "LEAVE_REJECTED",
            entityType: "LEAVE_REQUEST",
            entityId: leaveRequest.id,
            newData: leaveRequest,
            broadcastEvent: "team_update",
            targetUserIds,
            subjectUserId,
            subjectName,
        });
    }

    static async emitLeaveDeleted(actorId: string, workspaceId: string, leaveRequest: any) {
        const actor = await prisma.user.findUnique({ 
            where: { id: actorId }, 
            select: { surname: true } 
        });

        const { targetUserIds, subjectUserId, subjectName } = await this.getInvolvedUsers(workspaceId, leaveRequest.workspaceMemberId);

        await recordActivity({
            userId: actorId,
            userName: actor?.surname || "Member",
            workspaceId,
            action: "LEAVE_DELETED",
            entityType: "LEAVE_REQUEST",
            entityId: leaveRequest.id,
            oldData: leaveRequest,
            broadcastEvent: "team_update",
            targetUserIds,
            subjectUserId,
            subjectName,
        });
    }
}
