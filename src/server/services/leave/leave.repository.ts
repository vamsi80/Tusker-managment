import prisma from "@/lib/db";
import { CreateLeaveParams, LeaveStatus, LeaveType } from "@/types/leave";

export class LeaveRepository {
    static async create(params: CreateLeaveParams, workspaceMemberId: string) {
        return await (prisma as any).leave_request.create({
            data: {
                workspaceId: params.workspaceId,
                workspaceMemberId,
                startDate: params.startDate,
                endDate: params.endDate,
                reason: params.reason,
                type: params.type,
                status: "PENDING",
            },
        });
    }

    static async findById(id: string) {
        return await (prisma as any).leave_request.findUnique({
            where: { id },
            include: {
                WorkspaceMember: true,
                Workspace: true
            }
        });
    }

    static async updateStatus(id: string, status: LeaveStatus) {
        return await (prisma as any).leave_request.update({
            where: { id },
            data: { status }
        });
    }

    static async getWorkspaceLeaves(workspaceId: string, memberId?: string, skip: number = 0, take: number = 10) {
        const where = {
            workspaceId,
            ...(memberId ? { workspaceMemberId: memberId } : {})
        };

        const [leaves, totalCount] = await Promise.all([
            (prisma as any).leave_request.findMany({
                where,
                include: {
                    WorkspaceMember: {
                        select: {
                            id: true,
                            reportToId: true,
                            casualLeaveBalance: true,
                            sickLeaveBalance: true,
                            user: {
                                select: {
                                    surname: true,
                                    email: true,
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: "desc" },
                skip,
                take
            }),
            (prisma as any).leave_request.count({ where })
        ]);

        return { leaves, totalCount };
    }
}
