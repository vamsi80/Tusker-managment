import { recordActivity } from "@/lib/audit";
import { broadcastAttendanceUpdate } from "@/lib/realtime";
import { invalidateWorkspaceAttendance } from "@/lib/cache/invalidation";
import prisma from "@/lib/db";

export class AttendanceEvents {
    private static async getInvolvedUsers(workspaceId: string, memberUserId: string) {
        // 1. Get all Owners and Admins in the workspace
        const admins = await prisma.workspaceMember.findMany({
            where: {
                workspaceId,
                workspaceRole: { in: ["OWNER", "ADMIN"] }
            },
            select: { userId: true }
        });

        const targetUserIds = new Set<string>();
        targetUserIds.add(memberUserId);
        admins.forEach(a => targetUserIds.add(a.userId));

        return Array.from(targetUserIds);
    }

    static async emitAttendanceUpdate(workspaceId: string, type: "CHECK_IN" | "CHECK_OUT", action: string, attendance: any, networkLocation?: string) {
        // Clear cache
        await invalidateWorkspaceAttendance(workspaceId);

        const userId = attendance.WorkspaceMember.userId;
        const targetUserIds = await this.getInvolvedUsers(workspaceId, userId);

        // Notify clients (Surgical Sync)
        await broadcastAttendanceUpdate({
            workspaceId,
            type,
            action: action as any,
            payload: { ...attendance, networkLocation },
            targetUserIds
        });

        // Record Audit Activity
        const userName = attendance.WorkspaceMember.user?.surname || (() => { throw new Error(`User surname missing for member: ${attendance.WorkspaceMember.id}`); })();

        await recordActivity({
            userId,
            userName,
            workspaceId,
            action: action as any,
            entityType: "ATTENDANCE",
            entityId: attendance.id,
            newData: {
                ...attendance,
                networkLocation
            },
            targetUserIds
        });
    }

    static async emitAdminUpdate(actorId: string, workspaceId: string, attendanceId: string, oldData: any, newData: any) {
        const attendance = await prisma.attendance.findUnique({
            where: { id: attendanceId },
            include: { WorkspaceMember: { select: { userId: true } } }
        });

        if (!attendance) return;

        const actorUser = await prisma.user.findUnique({ where: { id: actorId }, select: { surname: true } });
        const targetUserIds = await this.getInvolvedUsers(workspaceId, attendance.WorkspaceMember.userId);

        await recordActivity({
            userId: actorId,
            userName: actorUser?.surname || "Admin",
            workspaceId,
            action: "TASK_UPDATED",
            entityType: "ATTENDANCE",
            entityId: attendanceId,
            oldData,
            newData,
            broadcastEvent: "team_update",
            targetUserIds
        });
    }
}
