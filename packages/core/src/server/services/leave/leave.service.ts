import prisma from "@tusker/db";
import { AppError } from "../../../lib/errors/app-error";
import { randomUUID } from "crypto";
import { AttendanceStatus } from "@tusker/db";
import { addDateOnlyDays, countDateOnlyDays, toDateOnly } from "../../../lib/date-utils";
import { LeaveRepository } from "./leave.repository";
import { LeaveEvents } from "./leave.events";
import { LeaveMapper } from "./leave.mapper";
import { CreateLeaveParams, UpdateLeaveStatusParams } from "../../../types/leave";

export class LeaveService {
    private static async getWorkspaceMember(workspaceId: string, userId: string) {
        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId, userId },
        });
        if (!member) throw AppError.Forbidden("You are not a member of this workspace.");
        return member;
    }

    static async createLeaveRequest(params: CreateLeaveParams) {
        const member = await this.getWorkspaceMember(params.workspaceId, params.userId);

        // Pin both ends to calendar days before they reach a `@db.Date` column,
        // whatever the caller handed us. An omitted end date means a single day.
        const startDate = toDateOnly(params.startDate);
        const endDate = toDateOnly(params.endDate) ?? startDate;

        if (!startDate || !endDate) {
            throw AppError.ValidationError("A valid start and end date are required.");
        }
        if (endDate < startDate) {
            throw AppError.ValidationError("End date must be on or after the start date.");
        }

        const leaveRequest = await LeaveRepository.create({ ...params, startDate, endDate }, member.id);

        await LeaveEvents.emitLeaveRequested(params.userId, params.workspaceId, leaveRequest);
        return leaveRequest;
    }

    static async updateLeaveStatus({ id, status, actorId, workspaceId }: UpdateLeaveStatusParams) {
        const [leave, actorMember] = await Promise.all([
            LeaveRepository.findById(id),
            prisma.workspaceMember.findFirst({
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
            // startDate/endDate come from `@db.Date` columns, so they are already
            // calendar days at midnight UTC. Iterate them in UTC — getDate/setDate
            // would fold the server's local timezone into the day boundary.
            const start = toDateOnly(leave.startDate)!;
            const end = toDateOnly(leave.endDate)!;
            const days = countDateOnlyDays(start, end);

            await prisma.workspaceMember.update({
                where: { id: leave.workspaceMemberId },
                data: {
                    [leave.type === "CASUAL" ? "casualLeaveBalance" : "sickLeaveBalance"]: { decrement: days }
                }
            });

            // Sync with attendance records
            for (let current = start; current <= end; current = addDateOnlyDays(current, 1)) {
                const dateOnly = new Date(current.getTime());
                await (prisma.attendance as any).upsert({
                    where: {
                        workspaceMemberId_date: {
                            workspaceMemberId: leave.workspaceMemberId,
                            date: dateOnly
                        }
                    },
                    create: {
                        id: randomUUID(),
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
            }
        }

        const updated = await LeaveRepository.updateStatus(id, status, actorMember.id);
        await LeaveEvents.emitLeaveStatusUpdated(actorId, workspaceId, updated, status);

        return updated;
    }

    static async updateLeaveRequest(id: string, params: Partial<CreateLeaveParams>, actorId: string, workspaceId: string) {
        const [leave, actorMember] = await Promise.all([
            LeaveRepository.findById(id),
            prisma.workspaceMember.findFirst({
                where: { workspaceId, userId: actorId }
            })
        ]);

        if (!leave) throw AppError.NotFound("Leave request not found.");
        if (!actorMember) throw AppError.Unauthorized("You are not a member of this workspace.");

        if (leave.workspaceMemberId !== actorMember.id) {
            throw AppError.Forbidden("You can only edit your own leave requests.");
        }

        if (leave.status !== "PENDING") {
            throw AppError.ValidationError("You can only edit pending leave requests.");
        }
        
        const startDate = params.startDate ? toDateOnly(params.startDate) : undefined;
        let endDate = params.endDate ? toDateOnly(params.endDate) : undefined;
        
        if (startDate || endDate) {
            const finalStart = startDate ?? leave.startDate;
            const finalEnd = endDate ?? leave.endDate;
            if (finalEnd < finalStart) {
                throw AppError.ValidationError("End date must be on or after the start date.");
            }
        }

        const updated = await LeaveRepository.updateRequest(id, {
            ...params,
            ...(startDate && { startDate }),
            ...(endDate && { endDate })
        });

        // We can just emit the updated request event, it shares the same payload structure
        await LeaveEvents.emitLeaveRequested(actorId, workspaceId, updated);
        
        return updated;
    }

    static async deleteLeaveRequest(id: string, actorId: string, workspaceId: string) {
        const [leave, actorMember] = await Promise.all([
            LeaveRepository.findById(id),
            prisma.workspaceMember.findFirst({
                where: { workspaceId, userId: actorId }
            })
        ]);

        if (!leave) throw AppError.NotFound("Leave request not found.");
        if (!actorMember) throw AppError.Unauthorized("You are not a member of this workspace.");

        const isWorkspaceAdmin = actorMember.workspaceRole === "OWNER" || actorMember.workspaceRole === "ADMIN";

        if (leave.workspaceMemberId !== actorMember.id && !isWorkspaceAdmin) {
            throw AppError.Forbidden("You can only delete your own leave requests.");
        }

        if (leave.status !== "PENDING") {
            throw AppError.ValidationError("You can only delete pending leave requests.");
        }

        const deleted = await LeaveRepository.delete(id);
        
        await LeaveEvents.emitLeaveDeleted(actorId, workspaceId, deleted);
        
        return deleted;
    }

    static async getWorkspaceLeaves(workspaceId: string, actorId: string, page: number = 1, pageSize: number = 10, search?: string) {
        const skip = (page - 1) * pageSize;
        
        // Resolve role and subordinates
        const member = await prisma.workspaceMember.findFirst({
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
            prisma.workspaceMember.findFirst({
                where: { workspaceId, userId },
                select: {
                    id: true,
                    casualLeaveBalance: true,
                    sickLeaveBalance: true,
                    accruedDaysCount: true,
                }
            }),
            prisma.workspace.findUnique({
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
