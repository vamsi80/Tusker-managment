import { AttendanceStatus } from "@/generated/prisma/client";

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
export type LeaveType = "CASUAL" | "SICK";

export interface CreateLeaveParams {
    workspaceId: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    reason: string;
    type: LeaveType;
}

export interface UpdateLeaveStatusParams {
    id: string;
    status: "APPROVED" | "REJECTED";
    actorId: string;
    workspaceId: string;
}

export interface LeaveRequestWithMember {
    id: string;
    startDate: Date;
    endDate: Date;
    reason: string;
    status: LeaveStatus;
    type: LeaveType;
    createdAt: Date;
    surname: string;
    email: string | null;
    workspaceMemberId: string;
    reportToId: string | null;
    casualLeaveBalance: number;
    sickLeaveBalance: number;
}
