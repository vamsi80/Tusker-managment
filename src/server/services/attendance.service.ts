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

    private static getISTDateOnly(date: Date) {
        // IST is UTC+5:30
        const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
        const year = istDate.getUTCFullYear();
        const month = istDate.getUTCMonth();
        const day = istDate.getUTCDate();
        return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }

    /**
     * Get attendance for today for a specific user.
     */
    static async getTodayAttendance(workspaceId: string, userId: string) {
        const member = await this.getWorkspaceMember(workspaceId, userId);

        const now = new Date();
        const dateOnly = this.getISTDateOnly(now);

        // 1. Try to find a record for today (IST)
        let record = await prisma.attendance.findUnique({
            where: {
                workspaceMemberId_date: {
                    workspaceMemberId: member.id,
                    date: dateOnly,
                }
            }
        });

        // 2. If no record for today OR it's an ABSENT record/already closed, 
        // look for an open record from yesterday (Night Shift support)
        if (!record || record.status === AttendanceStatus.ABSENT || record.checkOut) {
            const yesterday = new Date(dateOnly);
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);

            const openRecord = await prisma.attendance.findUnique({
                where: {
                    workspaceMemberId_date: {
                        workspaceMemberId: member.id,
                        date: yesterday,
                    }
                }
            });

            // Use yesterday's record if it exists and is still open
            if (openRecord && !openRecord.checkOut) {
                record = openRecord;
            }
        }

        return record;
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
        const dateOnly = this.getISTDateOnly(now);

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

        // Calculate IST time for threshold checks (IST = UTC + 5:30)
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const istHours = istDate.getUTCHours();
        const istMinutes = istDate.getUTCMinutes();
        const istTotalMinutes = istHours * 60 + istMinutes;

        // Fetch workspace thresholds using raw SQL to bypass Prisma Client's field validation
        const workspaceData = await prisma.$queryRawUnsafe<any[]>(
            `SELECT "lateThreshold", "halfDayThreshold" FROM "public"."Workspace" WHERE "id" = $1 LIMIT 1`,
            workspaceId
        );
        const workspace = workspaceData[0];

        // Parse thresholds into minutes-since-midnight (24h format stored in DB)
        const parseTime = (t: string, def: string) => {
            const [h, m] = (t || def).split(":").map(Number);
            return h * 60 + m;
        };

        const lateThresholdStr = workspace?.lateThreshold || "21:30";
        const halfDayThresholdStr = (workspace as any)?.halfDayThreshold || "23:00";

        const lateMinutes = parseTime(lateThresholdStr, "21:30");
        const halfDayMinutes = parseTime(halfDayThresholdStr, "23:00");

        // Status logic (4 levels)
        let status: AttendanceStatus = AttendanceStatus.PRESENT;
        if (istTotalMinutes >= halfDayMinutes) {
            status = AttendanceStatus.HALF_DAY;  // Checked in too late → half day
        } else if (istTotalMinutes >= lateMinutes) {
            status = AttendanceStatus.LATE;       // Checked in late but not half-day
        }

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
                lateThreshold: lateThresholdStr,
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
        const dateOnly = this.getISTDateOnly(now);

        // 1. Try to find record for today first
        let existing = await prisma.attendance.findUnique({
            where: {
                workspaceMemberId_date: {
                    workspaceMemberId: member.id,
                    date: dateOnly,
                }
            }
        });

        // 2. If not found or already checked out today, check for an open record from yesterday (Night Shift support)
        if (!existing || existing.checkOut) {
            const yesterday = new Date(dateOnly);
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);

            const openRecord = await prisma.attendance.findUnique({
                where: {
                    workspaceMemberId_date: {
                        workspaceMemberId: member.id,
                        date: yesterday,
                    }
                }
            });

            // Use yesterday's record if it exists and is still open
            if (openRecord && !openRecord.checkOut) {
                existing = openRecord;
            }
        }

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

        // Fetch workspace thresholds using raw SQL to bypass Prisma Client's field validation
        const workspaceData = await prisma.$queryRawUnsafe<any[]>(
            `SELECT "overtimeThreshold", "shiftStartTime" FROM "public"."Workspace" WHERE "id" = $1 LIMIT 1`,
            workspaceId
        );
        const workspace = workspaceData[0];
        
        const otThreshold = workspace?.overtimeThreshold || "07:30";
        const shiftStartThreshold = workspace?.shiftStartTime || "21:30";

        const [otH, otM] = otThreshold.split(":").map(Number);
        const [startH, startM] = shiftStartThreshold.split(":").map(Number);
        
        const istTotalMinutes = istHours * 60 + istMinutes;
        const otTotalMinutes = otH * 60 + otM;
        const startTotalMinutes = startH * 60 + startM;

        let isOvertime = false;
        if (startTotalMinutes > otTotalMinutes) {
            // Night Shift: Starts late (e.g. 21:30), Ends early morning (e.g. 07:30)
            // OT is true if we are past otTotalMinutes BUT haven't reached the next day's startTotalMinutes yet
            isOvertime = istTotalMinutes > otTotalMinutes && istTotalMinutes < startTotalMinutes;
        } else {
            // Day Shift: Starts early, Ends late
            isOvertime = istTotalMinutes > otTotalMinutes;
        }

        const otThresholdValue = otThreshold;

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
            userName: user?.surname || "Someone",
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
        const dateOnly = this.getISTDateOnly(date);

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

    /**
     * Update workspace attendance settings
     */
    static async updateSettings(
        workspaceId: string,
        data: {
            lateThreshold: string;
            overtimeThreshold: string;
            halfDayThreshold: string;
            shiftStartTime: string;
            shiftEndTime: string;
        },
        actorId: string,
    ) {
        console.log("[AttendanceService.updateSettings] Received data:", data);
        
        try {
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            const fields: (keyof typeof data)[] = ["lateThreshold", "overtimeThreshold", "halfDayThreshold", "shiftStartTime", "shiftEndTime"];
            for (const field of fields) {
                if (data[field] && !timeRegex.test(data[field])) {
                    console.error(`[AttendanceService.updateSettings] Validation failed for ${field}:`, data[field]);
                    throw AppError.ValidationError(`Invalid time for ${field}. Use HH:mm format.`);
                }
            }

            // Fallback for shiftEndTime if not provided explicitly but we have overtime
            const shiftEndTime = data.shiftEndTime || data.overtimeThreshold;

            // Use raw SQL update to bypass Prisma Client's field validation which fails if npx prisma generate hasn't run.
            // This is a robust way to ensure settings can be saved even if the server is locking the client files.
            await prisma.$executeRawUnsafe(
                `UPDATE "public"."Workspace" 
                 SET "lateThreshold" = $1, 
                     "overtimeThreshold" = $2, 
                     "halfDayThreshold" = $3, 
                     "shiftStartTime" = $4, 
                     "shiftEndTime" = $5,
                     "updatedAt" = NOW()
                 WHERE "id" = $6`,
                data.lateThreshold,
                data.overtimeThreshold,
                data.halfDayThreshold,
                data.shiftStartTime,
                shiftEndTime,
                workspaceId
            );

            // Fetch the updated workspace manually
            const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });

            // Record Activity
            const actor = await prisma.user.findUnique({
                where: { id: actorId },
                select: { name: true, surname: true },
            });

            await recordActivity({
                userId: actorId,
                userName: actor?.name || actor?.surname || "Admin",
                workspaceId,
                action: "ATTENDANCE_SETTINGS_UPDATED",
                entityType: "WORKSPACE",
                entityId: workspaceId,
                newData: data,
                broadcastEvent: "workspace_update",
            });

            return workspace;
        } catch (error: any) {
            console.error("[AttendanceService.updateSettings] Error:", error);
            throw error;
        }
    }
}
