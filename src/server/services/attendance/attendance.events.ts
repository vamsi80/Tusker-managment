import { recordActivity } from "@/lib/audit";
import { broadcastAttendanceUpdate } from "@/lib/realtime";
import { invalidateWorkspaceAttendance } from "@/lib/cache/invalidation";
import prisma from "@/lib/db";

export class AttendanceEvents {
    static async emitAttendanceUpdate(workspaceId: string, type: "CHECK_IN" | "CHECK_OUT", action: string, attendance: any, networkLocation?: string) {
        // Clear cache
        await invalidateWorkspaceAttendance(workspaceId);
        
        // Notify clients
        await broadcastAttendanceUpdate({
            workspaceId,
            type,
            action: action as any,
            payload: { ...attendance, networkLocation }
        });

        // Record Audit Activity
        const userId = attendance.WorkspaceMember.userId;
        const userName = attendance.WorkspaceMember.user?.surname || attendance.WorkspaceMember.user?.name || "Someone";

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
        });
    }

    static async emitAdminUpdate(actorId: string, workspaceId: string, attendanceId: string, oldData: any, newData: any) {
        const actorUser = await prisma.user.findUnique({ where: { id: actorId }, select: { surname: true } });
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
        });
    }
}
