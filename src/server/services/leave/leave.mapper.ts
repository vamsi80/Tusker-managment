import { LeaveRequestWithMember } from "@/types/leave";

export class LeaveMapper {
    static toService(leave: any): LeaveRequestWithMember {
        return {
            id: leave.id,
            startDate: leave.startDate,
            endDate: leave.endDate,
            reason: leave.reason,
            status: leave.status,
            type: leave.type,
            createdAt: leave.createdAt,
            surname: leave.WorkspaceMember?.user?.surname || "Member",
            email: leave.WorkspaceMember?.user?.email || null,
            workspaceMemberId: leave.workspaceMemberId,
            reportToId: leave.WorkspaceMember?.reportToId || null,
            casualLeaveBalance: leave.WorkspaceMember?.casualLeaveBalance || 0,
            sickLeaveBalance: leave.WorkspaceMember?.sickLeaveBalance || 0,
            processedByName: leave.processedBy?.user?.surname || null,
        };
    }

    static toServiceList(leaves: any[]): LeaveRequestWithMember[] {
        return leaves.map(this.toService);
    }
}
