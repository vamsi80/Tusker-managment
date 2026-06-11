import { LeaveRequestWithMember, LeaveStatus, LeaveType } from "@/types/leave";

export interface DBLeaveInput {
    id: string;
    startDate: Date;
    endDate: Date;
    reason: string | null;
    status: LeaveStatus;
    type: LeaveType;
    createdAt: Date;
    workspaceMemberId: string;
    WorkspaceMember?: {
        reportToId?: string | null;
        casualLeaveBalance?: number;
        sickLeaveBalance?: number;
        user?: {
            surname?: string | null;
            email?: string | null;
        } | null;
    } | null;
    processedBy?: {
        user?: {
            surname?: string | null;
        } | null;
    } | null;
}

export class LeaveMapper {
    static toService(leave: DBLeaveInput): LeaveRequestWithMember {
        return {
            id: leave.id,
            startDate: leave.startDate,
            endDate: leave.endDate,
            reason: leave.reason || "",
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

    static toServiceList(leaves: DBLeaveInput[]): LeaveRequestWithMember[] {
        return leaves.map((l) => this.toService(l));
    }
}
