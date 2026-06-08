import { getDb } from "@/lib/registry";
import { AppError } from "@tusker/shared/errors";

import { AttendanceStatus } from "@/generated/prisma";
import { getISTDateOnly } from "@tusker/shared/date-utils";
import { LeaveRepository } from "./leave.repository";
import { LeaveEvents } from "./leave.events";
import { LeaveMapper } from "./leave.mapper";
import { CreateLeaveParams, UpdateLeaveStatusParams } from "@/types/leave";

export class LeaveService {
    private static async getWorkspaceMember(workspaceId: string, userId: string) {
        const member = await getDb().workspaceMember.findFirst({
            where: { workspaceId, userId },
        });
        if (!member) throw AppError.Forbidden("You are not a member of this workspace.");
        return member;
    }

    static async createLeaveRequest(params: CreateLeaveParams) {
        const member = await this.getWorkspaceMember(params.workspaceId, params.userId);
        const leaveRequest = await LeaveRepository.create(params, member.id);
        
        await LeaveEvents.emitLeaveRequested(params.userId, params.workspaceId, leaveRequest);
        return leaveRequest;
    }

    static async updateLeaveStatus({ id, status, actorId, workspaceId }: UpdateLeaveStatusParams) {
        const [leave, actorMember] = await Promise.all([
            LeaveRepository.findById(id),
            getDb().workspaceMember.findFirst({
                where: { workspaceId, userId: actorId }
            })
        ]);

        if (!leave) throw AppError.NotFound("Leave request not found.");
        if (!actorMember) throw AppError.Unauthorized("You are not a member of this workspace.");

        const isWorkspaceAdmin = actorMember.workspaceRole === "OWNER" || actorMember.workspaceRole === "ADMIN";
        const isReportingManager = leave.WorkspaceMember.reportToId === actorMember.id;

        if (!isWorkspaceAdmin && !isReportingManager) {
            throw AppError.Unauthorized("Only owners, admins, or the designated reporting manager can process this leave request.");
        }

        if (leave.status !== "PENDING") throw AppError.ValidationError("This leave request has already been processed.");

        if (status === "APPROVED") {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            await getDb().workspaceMember.update({
                where: { id: leave.workspaceMemberId },
                data: {
                    [leave.type === "CASUAL" ? "casualLeaveBalance" : "sickLeaveBalance"]: { decrement: days }
                }
            });

            // Sync with attendance records
            const current = new Date(start);
            while (current <= end) {
                const dateOnly = getISTDateOnly(current);
                await (getDb().attendance as any).upsert({
                    where: {
                        workspaceMemberId_date: {
                            workspaceMemberId: leave.workspaceMemberId,
                            date: dateOnly
                        }
                    },
                    create: {
                        id: crypto.randomUUID(),
                        workspaceId,
                        workspaceMemberId: leave.workspaceMemberId,
                        date: dateOnly,
                        status: AttendanceStatus.ON_LEAVE,
                        updatedAt: new Date()
                    },
                    update: {
                        status: AttendanceStatus.ON_LEAVE,
                        updatedAt: new Date()
                    }
                });
                current.setDate(current.getDate() + 1);
            }
        }

        const updated = await LeaveRepository.updateStatus(id, status, actorMember.id);
        await LeaveEvents.emitLeaveStatusUpdated(actorId, workspaceId, updated, status);

        return updated;
    }

    static async getWorkspaceLeaves(workspaceId: string, actorId: string, page: number = 1, pageSize: number = 10, search?: string) {
        const skip = (page - 1) * pageSize;
        
        // Resolve role and subordinates
        const member = await getDb().workspaceMember.findFirst({
            where: { workspaceId, userId: actorId },
            include: { subordinates: { select: { id: true } } }
        });

        if (!member) throw AppError.Forbidden("You are not a member of this workspace.");

        let memberIds: string[] | undefined = undefined;
        const isAuthority = member.workspaceRole === "OWNER" || member.workspaceRole === "ADMIN";
        
        if (!isAuthority) {
            if (member.workspaceRole === "MANAGER") {
                // Manager sees themselves + subordinates
                memberIds = [member.id, ...member.subordinates.map(s => s.id)];
            } else {
                // Regular member sees only themselves
                memberIds = [member.id];
            }
        }

        const { leaves, totalCount } = await LeaveRepository.getWorkspaceLeaves(workspaceId, memberIds, skip, pageSize, search);
        
        return { 
            leaves: LeaveMapper.toServiceList(leaves), 
            totalCount 
        };
    }

    static async getMemberBalances(workspaceId: string, userId: string) {
        const [member, workspace] = await Promise.all([
            getDb().workspaceMember.findFirst({
                where: { workspaceId, userId },
                select: {
                    id: true,
                    casualLeaveBalance: true,
                    sickLeaveBalance: true,
                    accruedDaysCount: true,
                }
            }),
            getDb().workspace.findUnique({
                where: { id: workspaceId },
                select: { casualLeaveAccrualDays: true }
            })
        ]);

        if (!member) return null;

        return {
            ...member,
            accrualThreshold: workspace?.casualLeaveAccrualDays || 20
        };
    }
}
