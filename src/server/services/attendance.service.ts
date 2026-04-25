import "server-only";

import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import { recordActivity } from "@/lib/audit";
import { randomUUID } from "crypto";
import { AttendanceStatus, WorkspaceRole } from "@/generated/prisma/client";

export class AttendanceService {
    /**
     * Get the WorkspaceMember ID for a specific user in a workspace.
     */
    private static async getWorkspaceMember(workspaceId: string, userId: string) {
        const member = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId,
                userId,
            },
        });

        if (!member) {
            throw AppError.Forbidden("You are not a member of this workspace.");
        }

        return member;
    }

    /**
     * Get attendance for today for a specific user.
     */
    static async getTodayAttendance(workspaceId: string, userId: string) {
        const member = await this.getWorkspaceMember(workspaceId, userId);

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        return await prisma.attendance.findUnique({
            where: {
                workspaceMemberId_date: {
                    workspaceMemberId: member.id,
                    date: today,
                }
            }
        });
    }

    /**
     * Check In for the day.
     */
    static async checkIn({
        workspaceId,
        userId,
        latitude,
        longitude,
        address
    }: {
        workspaceId: string;
        userId: string;
        latitude?: number;
        longitude?: number;
        address?: string;
    }) {
        const member = await this.getWorkspaceMember(workspaceId, userId);

        const now = new Date();
        const dateOnly = new Date(now);
        dateOnly.setUTCHours(0, 0, 0, 0);

        // Check if already checked in
        const existing = await prisma.attendance.findUnique({
            where: {
                workspaceMemberId_date: {
                    workspaceMemberId: member.id,
                    date: dateOnly,
                }
            }
        });

        if (existing) {
            throw AppError.Conflict("You have already checked in today.");
        }

        const id = randomUUID();

        // Calculate IST time for "Late" check
        // IST is UTC + 5:30
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const istHours = istDate.getUTCHours();
        const istMinutes = istDate.getUTCMinutes();

        // Get dynamic threshold from workspace settings
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { lateThreshold: true }
        });
        const [lateH, lateM] = (workspace?.lateThreshold || "09:40").split(":").map(Number);

        let status: AttendanceStatus = AttendanceStatus.PRESENT;
        if (istHours > lateH || (istHours === lateH && istMinutes > lateM)) {
            status = AttendanceStatus.LATE;
        }

        const lateThresholdValue = workspace?.lateThreshold || "09:40";

        const attendance = await (prisma.attendance as any).create({
            data: {
                id,
                workspaceId,
                workspaceMemberId: member.id,
                date: dateOnly,
                checkIn: now,
                checkInLatitude: latitude,
                checkInLongitude: longitude,
                checkInAddress: address,
                status: status,
                lateThreshold: lateThresholdValue,
                updatedAt: now,
            }
        });

        // Record Audit Activity
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
        await recordActivity({
            userId,
            userName: user?.surname || user?.name || "Someone",
            workspaceId,
            action: "CHECKED_IN",
            entityType: "ATTENDANCE",
            entityId: id,
            newData: { checkIn: now.toISOString(), latitude, longitude },
            broadcastEvent: "team_update",
        });

        return attendance;
    }

    /**
     * Check Out for the day.
     */
    static async checkOut({
        workspaceId,
        userId,
        latitude,
        longitude,
        address
    }: {
        workspaceId: string;
        userId: string;
        latitude?: number;
        longitude?: number;
        address?: string;
    }) {
        const member = await this.getWorkspaceMember(workspaceId, userId);

        const now = new Date();
        const dateOnly = new Date(now);
        dateOnly.setUTCHours(0, 0, 0, 0);

        const existing = await prisma.attendance.findUnique({
            where: {
                workspaceMemberId_date: {
                    workspaceMemberId: member.id,
                    date: dateOnly,
                }
            }
        });

        if (!existing) {
            throw AppError.NotFound("You must check in before checking out.");
        }

        if (existing.checkOut) {
            throw AppError.Conflict("You have already checked out today.");
        }

        // Calculate IST time for Overtime check
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const istHours = istDate.getUTCHours();
        const istMinutes = istDate.getUTCMinutes();

        // Get dynamic threshold from workspace settings
        const workspaceSettings = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { overtimeThreshold: true }
        });
        const [otH, otM] = (workspaceSettings?.overtimeThreshold || "19:00").split(":").map(Number);

        const isOvertime = istHours > otH || (istHours === otH && istMinutes >= otM);

        const otThresholdValue = workspaceSettings?.overtimeThreshold || "19:00";

        const updated = await (prisma.attendance as any).update({
            where: { id: existing.id },
            data: {
                checkOut: now,
                checkOutLatitude: latitude,
                checkOutLongitude: longitude,
                checkOutAddress: address,
                isOvertime: isOvertime,
                overtimeThreshold: otThresholdValue,
                updatedAt: now,
            }
        });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
        await recordActivity({
            userId,
            userName: user?.surname || user?.name || "Someone",
            workspaceId,
            action: "CHECKED_OUT",
            entityType: "ATTENDANCE",
            entityId: existing.id,
            newData: { checkOut: now.toISOString(), latitude, longitude },
            broadcastEvent: "team_update",
        });

        return updated;
    }

    /**
     * Mark missing members as ABSENT for a specific date
     */
    static async reconcileAttendance(workspaceId: string, date: Date) {
        const dateOnly = new Date(date);
        dateOnly.setUTCHours(0, 0, 0, 0);

        // 1. Get all active members in the workspace
        const members = await prisma.workspaceMember.findMany({
            where: {
                workspaceId,
                // Only include roles that should have attendance (e.g., exclude OWNERS if needed, but keeping all for now)
                workspaceRole: {
                    in: [WorkspaceRole.MEMBER, WorkspaceRole.ADMIN, WorkspaceRole.MANAGER]
                }
            }
        });

        // 2. Get existing attendance for today
        const existingRecords = await prisma.attendance.findMany({
            where: {
                workspaceId,
                date: dateOnly
            },
            select: {
                workspaceMemberId: true
            }
        });

        const existingMemberIds = new Set(existingRecords.map(r => r.workspaceMemberId));

        // 3. Find missing members
        const missingMembers = members.filter(m => !existingMemberIds.has(m.id));

        if (missingMembers.length === 0) return { count: 0 };

        // 4. Create ABSENT records
        const data = missingMembers.map(m => ({
            id: randomUUID(),
            workspaceId,
            workspaceMemberId: m.id,
            date: dateOnly,
            status: AttendanceStatus.ABSENT,
            updatedAt: new Date(),
        }));

        await prisma.attendance.createMany({
            data
        });

        return { count: missingMembers.length };
    }

    /**
     * Get Workspace Attendance for a given date range
     */
    static async getWorkspaceAttendance(
        workspaceId: string,
        startDate?: Date,
        endDate?: Date,
        filters?: { memberId?: string; status?: AttendanceStatus }
    ) {
        // Find all records for the workspace, with optional date range
        return await prisma.attendance.findMany({
            where: {
                workspaceId,
                ...(startDate && endDate ? {
                    date: {
                        gte: startDate,
                        lte: endDate,
                    },
                } : {}),
                ...(filters?.memberId ? { workspaceMemberId: filters.memberId } : {}),
                ...(filters?.status ? { status: filters.status } : {}),
            },
            include: {
                WorkspaceMember: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                surname: true,
                                email: true,
                                image: true,
                            }
                        }
                    }
                }
            },
            orderBy: {
                date: 'desc'
            }
        });
    }

    /**
     * Update an attendance record (Strict Admin/Owner use)
     */
    static async updateAttendance(id: string, data: any, actorId: string, workspaceId: string) {
        // 1. Permission Check: Only Owner and Admin
        const actor = await prisma.workspaceMember.findFirst({
            where: { workspaceId, userId: actorId },
            select: { workspaceRole: true }
        });

        if (!actor || (actor.workspaceRole !== WorkspaceRole.OWNER && actor.workspaceRole !== WorkspaceRole.ADMIN)) {
            throw AppError.Forbidden("Only Owners and Admins are permitted to edit attendance records.");
        }

        const existing = await prisma.attendance.findUnique({ where: { id } });
        if (!existing) throw AppError.NotFound("Attendance record not found.");

        const updateData: any = { ...data };

        // 2. Strict Status Calculation (Admin cannot manually flip LATE back to PRESENT)
        const checkIn = data.checkIn ? new Date(data.checkIn) : existing.checkIn;
        const lateThreshold = data.lateThreshold || existing.lateThreshold || "09:40";

        if (checkIn && lateThreshold) {
            const [lateH, lateM] = lateThreshold.split(":").map(Number);
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(checkIn.getTime() + istOffset);
            const istHours = istDate.getUTCHours();
            const istMinutes = istDate.getUTCMinutes();

            // Logic: If time is late, status IS LATE. Period.
            if (istHours > lateH || (istHours === lateH && istMinutes > lateM)) {
                updateData.status = AttendanceStatus.LATE;
            } else {
                updateData.status = AttendanceStatus.PRESENT;
            }
        }

        // 3. Strict Overtime Calculation
        const checkOut = data.checkOut ? new Date(data.checkOut) : existing.checkOut;
        const overtimeThreshold = data.overtimeThreshold || existing.overtimeThreshold || "19:00";

        if (checkOut && overtimeThreshold) {
            const [otH, otM] = overtimeThreshold.split(":").map(Number);
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(checkOut.getTime() + istOffset);
            const istHours = istDate.getUTCHours();
            const istMinutes = istDate.getUTCMinutes();
            updateData.isOvertime = istHours > otH || (istHours === otH && istMinutes >= otM);
        }

        const updated = await (prisma.attendance as any).update({
            where: { id },
            data: updateData,
        });

        // 4. Record Audit Activity
        const actorUser = await prisma.user.findUnique({ where: { id: actorId }, select: { surname: true } });
        await recordActivity({
            userId: actorId,
            userName: actorUser?.surname || "Admin",
            workspaceId,
            action: "TASK_UPDATED", 
            entityType: "ATTENDANCE",
            entityId: id,
            oldData: existing,
            newData: updated,
            broadcastEvent: "team_update",
        });

        return updated;
    }
}
