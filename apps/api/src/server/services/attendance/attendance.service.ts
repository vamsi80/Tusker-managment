
import { getDb } from "@/lib/registry";
import { AppError } from "@/lib/errors/app-error";
import { recordActivity, broadcastActivity } from "@/lib/audit";

import { AttendanceStatus, WorkspaceRole } from "../../../generated/prisma/client";
import { getISTDateOnly } from "@/lib/date-utils";
import { AttendanceRepository } from "./attendance.repository";
import { AttendanceEvents } from "./attendance.events";
import { 
    CheckInParams, 
    CheckOutParams, 
    AttendanceFilters, 
    UpdateSettingsParams 
} from "@/types/attendance";

export class AttendanceService {
    /**
     * Get the WorkspaceMember ID for a specific user in a workspace.
     */
    private static async getWorkspaceMember(workspaceId: string, userId: string) {
        const member = await getDb().workspaceMember.findFirst({
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

        const now = new Date();
        const dateOnly = getISTDateOnly(now);

        // 1. Try to find a record for today (IST)
        const record = await AttendanceRepository.findByMemberAndDate(member.id, dateOnly);

        // 2. If we have a record for today, use it
        if (record && record.status !== AttendanceStatus.ABSENT) {
            return record;
        }

        // 3. Night Shift Support: If no record for today, check if there's an OPEN one from yesterday
        const yesterday = new Date(dateOnly);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);

        const openRecord = await AttendanceRepository.findByMemberAndDate(member.id, yesterday);

        // Use yesterday's record ONLY if it is still open and recently started (< 22 hours ago)
        if (openRecord && !openRecord.checkOut && openRecord.checkIn) {
            const hoursSinceCheckIn = (now.getTime() - openRecord.checkIn.getTime()) / (1000 * 60 * 60);
            if (hoursSinceCheckIn < 22) {
                return openRecord;
            }
        }

        // 4. Otherwise, return today's record (even if null or ABSENT) to allow a fresh Check-In
        return record;
    }

    /**
     * Check In for the day.
     */
    static async checkIn(params: CheckInParams) {
        const { workspaceId, userId, latitude, longitude, address, networkLocation } = params;
        const member = await this.getWorkspaceMember(workspaceId, userId);
        const now = new Date();
        const dateOnly = getISTDateOnly(now);

        // Check if already checked in
        const existing = await AttendanceRepository.findByMemberAndDate(member.id, dateOnly);

        if (existing && existing.status !== AttendanceStatus.ABSENT && existing.status !== AttendanceStatus.ON_LEAVE) {
            throw AppError.Conflict("You have already checked in today.");
        }

        // Fetch workspace thresholds
        const workspaceData = await getDb().$queryRawUnsafe<any[]>(
            `SELECT "lateThreshold", "halfDayThreshold", "casualLeaveAccrualDays" FROM "public"."Workspace" WHERE "id" = $1 LIMIT 1`,
            workspaceId
        );
        const workspace = workspaceData[0];

        const parseTime = (t: string, def: string) => {
            const [h, m] = (t || def).split(":").map(Number);
            return h * 60 + m;
        };

        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const istTotalMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

        const lateThresholdStr = workspace?.lateThreshold || "21:30";
        const halfDayThresholdStr = workspace?.halfDayThreshold || "23:00";

        const lateMinutes = parseTime(lateThresholdStr, "21:30");
        const halfDayMinutes = parseTime(halfDayThresholdStr, "23:00");

        let status: AttendanceStatus = AttendanceStatus.PRESENT;
        if (istTotalMinutes >= halfDayMinutes) {
            status = AttendanceStatus.HALF_DAY;
        } else if (istTotalMinutes >= lateMinutes) {
            status = AttendanceStatus.LATE;
        }

        // Accuracy Check (Filtering out poor signals/spoofs)
        // Accuracy Check (Filtering out poor signals/spoofs)
        if (params.accuracy && params.accuracy > 200) {
            throw AppError.ValidationError(`GPS accuracy too low (${Math.round(params.accuracy)}m). Please move near a window or outdoor space to get a better signal.`);
        }

        // Location Matching & Enforcement
        const workspaceLocations = await getDb().attendanceLocation.count({ where: { workspaceId } });
        
        let finalAddress = address;
        if (latitude && longitude) {
            const nearbyLoc = await this.findNearbyLocation(workspaceId, latitude, longitude, params.accuracy);
            if (nearbyLoc) {
                finalAddress = nearbyLoc.name;
            } else if (workspaceLocations > 0 && !params.notes) {
                throw AppError.Forbidden("You are not within the required radius of any authorized attendance location.");
            }
        } else if (workspaceLocations > 0 && !params.notes) {
             throw AppError.ValidationError("GPS coordinates are required to check in at this workspace.");
        }

        const attendance = await AttendanceRepository.upsert(
            {
                workspaceMemberId_date: {
                    workspaceMemberId: member.id,
                    date: dateOnly,
                }
            },
            {
                id: crypto.randomUUID(),
                workspaceId,
                workspaceMemberId: member.id,
                date: dateOnly,
                checkIn: now,
                checkInLatitude: latitude,
                checkInLongitude: longitude,
                checkInAddress: finalAddress,
                status: status,
                lateThreshold: lateThresholdStr,
                checkInNotes: params.notes,
                notes: params.notes, // Legacy fallback
                updatedAt: now,
            },
            {
                checkIn: now,
                checkInLatitude: latitude,
                checkInLongitude: longitude,
                checkInAddress: finalAddress,
                status: status,
                lateThreshold: lateThresholdStr,
                checkInNotes: params.notes,
                notes: params.notes, // Legacy fallback
                updatedAt: now,
            }
        );

        // Notify and Record
        await AttendanceEvents.emitAttendanceUpdate(workspaceId, "CHECK_IN", "CHECKED_IN", attendance, networkLocation);

        // Casual Leave Accrual Logic
        if (status === AttendanceStatus.PRESENT || status === AttendanceStatus.LATE) {
            const threshold = workspace?.casualLeaveAccrualDays || 20;
            const updatedMember = await getDb().workspaceMember.update({
                where: { id: member.id },
                data: { accruedDaysCount: { increment: 1 } }
            });

            if (updatedMember.accruedDaysCount >= threshold) {
                await getDb().workspaceMember.update({
                    where: { id: member.id },
                    data: {
                        casualLeaveBalance: { increment: 1 },
                        accruedDaysCount: 0
                    }
                });
            }
        }

        return attendance;
    }

    /**
     * Check Out for the day.
     */
    static async checkOut(params: CheckOutParams) {
        const { workspaceId, userId, latitude, longitude, address, networkLocation } = params;
        const member = await this.getWorkspaceMember(workspaceId, userId);
        const now = new Date();
        const dateOnly = getISTDateOnly(now);

        let existing = await AttendanceRepository.findByMemberAndDate(member.id, dateOnly);

        if (!existing || existing.checkOut) {
            const yesterday = new Date(dateOnly);
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);
            const openRecord = await AttendanceRepository.findByMemberAndDate(member.id, yesterday);
            
            if (openRecord && !openRecord.checkOut && openRecord.checkIn) {
                const hoursSinceCheckIn = (now.getTime() - openRecord.checkIn.getTime()) / (1000 * 60 * 60);
                if (hoursSinceCheckIn < 24) {
                    existing = openRecord;
                }
            }
        }

        if (!existing) throw AppError.NotFound("You must check in before checking out.");
        if (existing.checkOut) throw AppError.Conflict("You have already checked out today.");

        const workspaceData = await getDb().$queryRawUnsafe<any[]>(
            `SELECT "overtimeThreshold", "shiftStartTime" FROM "public"."Workspace" WHERE "id" = $1 LIMIT 1`,
            workspaceId
        );
        const workspace = workspaceData[0];

        const otThreshold = workspace?.overtimeThreshold || "07:30";
        const shiftStartThreshold = workspace?.shiftStartTime || "21:30";
        const [otH, otM] = otThreshold.split(":").map(Number);
        const [startH, startM] = shiftStartThreshold.split(":").map(Number);

        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const istTotalMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
        const otTotalMinutes = otH * 60 + otM;
        const startTotalMinutes = startH * 60 + startM;

        let isOvertime = startTotalMinutes > otTotalMinutes 
            ? (istTotalMinutes > otTotalMinutes && istTotalMinutes < startTotalMinutes)
            : (istTotalMinutes > otTotalMinutes);

        // Accuracy Check
        // Accuracy Check
        if (params.accuracy && params.accuracy > 200) {
            throw AppError.ValidationError(`GPS accuracy too low (${Math.round(params.accuracy)}m). Please move near a window or outdoor space to get a better signal.`);
        }

        // Location Matching & Enforcement
        const workspaceLocations = await getDb().attendanceLocation.count({ where: { workspaceId } });

        let finalAddress = address;
        if (latitude && longitude) {
            const nearbyLoc = await this.findNearbyLocation(workspaceId, latitude, longitude, params.accuracy);
            if (nearbyLoc) {
                finalAddress = nearbyLoc.name;
            } else if (workspaceLocations > 0 && !params.notes) {
                throw AppError.Forbidden("You are not within the required radius of any authorized attendance location.");
            }
        } else if (workspaceLocations > 0 && !params.notes) {
             throw AppError.ValidationError("GPS coordinates are required to check out at this workspace.");
        }

        const updated = await AttendanceRepository.update(existing.id, {
            checkOut: now,
            checkOutLatitude: latitude,
            checkOutLongitude: longitude,
            checkOutAddress: finalAddress,
            isOvertime,
            overtimeThreshold: otThreshold,
            checkOutNotes: params.notes,
            notes: params.notes || existing.notes, // Legacy fallback
            updatedAt: now,
        });

        await AttendanceEvents.emitAttendanceUpdate(workspaceId, "CHECK_OUT", "CHECKED_OUT", updated, networkLocation);
        return updated;
    }

    /**
     * Mark missing members as ABSENT for a specific date
     */
    static async reconcileAttendance(workspaceId: string, date: Date) {
        const dateOnly = getISTDateOnly(date);

        const members = await getDb().workspaceMember.findMany({
            where: {
                workspaceId,
                workspaceRole: { in: [WorkspaceRole.MEMBER, WorkspaceRole.ADMIN, WorkspaceRole.MANAGER] }
            }
        });

        const existingRecords = await getDb().attendance.findMany({
            where: { workspaceId, date: dateOnly },
            select: { workspaceMemberId: true }
        });

        const existingMemberIds = new Set(existingRecords.map(r => r.workspaceMemberId));
        const missingMembers = members.filter(m => !existingMemberIds.has(m.id));

        if (missingMembers.length === 0) return { count: 0 };

        const approvedLeaves = await (getDb() as any).leave_request.findMany({
            where: {
                workspaceId,
                status: "APPROVED",
                startDate: { lte: dateOnly },
                endDate: { gte: dateOnly }
            },
            select: { workspaceMemberId: true }
        });

        const leaveMemberIds = new Set(approvedLeaves.map((l: any) => l.workspaceMemberId));

        const data = missingMembers.map(m => ({
            id: crypto.randomUUID(),
            workspaceId,
            workspaceMemberId: m.id,
            date: dateOnly,
            status: leaveMemberIds.has(m.id) ? AttendanceStatus.ON_LEAVE : AttendanceStatus.ABSENT,
            updatedAt: new Date(),
        }));

        await getDb().attendance.createMany({ data });
        return { count: missingMembers.length };
    }

    /**
     * Get Workspace Attendance for a given date range
     */
    static async getWorkspaceAttendance(
        workspaceId: string,
        actorId: string,
        startDate?: Date,
        endDate?: Date,
        filters?: AttendanceFilters,
        page: number = 1,
        pageSize: number = 10
    ) {
        return await (async () => {
                const skip = (page - 1) * pageSize;

                // Resolve role and subordinates
                const actorMember = await getDb().workspaceMember.findFirst({
                    where: { workspaceId, userId: actorId },
                    include: { subordinates: { select: { id: true } } }
                });

                if (!actorMember) throw AppError.Forbidden("You are not a member of this workspace.");

                const isAuthority = actorMember.workspaceRole === "OWNER" || actorMember.workspaceRole === "ADMIN";
                let allowedMemberIds: string[] | undefined = undefined;

                if (!isAuthority) {
                    if (actorMember.workspaceRole === "MANAGER") {
                        allowedMemberIds = [actorMember.id, ...actorMember.subordinates.map(s => s.id)];
                    } else {
                        allowedMemberIds = [actorMember.id];
                    }
                }

                // If a specific member filter is requested from UI, ensure it's within allowed list
                let finalMemberIdFilter = filters?.memberId;
                if (allowedMemberIds && finalMemberIdFilter && !allowedMemberIds.includes(finalMemberIdFilter)) {
                    // Unauthorized member filter requested - fallback to empty or restricted set
                    finalMemberIdFilter = "UNAUTHORIZED_ACCESS";
                }

                const where: any = {
                    workspaceId,
                    ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
                    ...(finalMemberIdFilter ? { workspaceMemberId: finalMemberIdFilter } : (allowedMemberIds ? { workspaceMemberId: { in: allowedMemberIds } } : {})),
                    ...(filters?.status ? { status: filters.status } : {}),
                };

                if (filters?.search) {
                    where.WorkspaceMember = {
                        user: {
                            OR: [
                                { name: { contains: filters.search, mode: 'insensitive' } },
                                { surname: { contains: filters.search, mode: 'insensitive' } },
                                { email: { contains: filters.search, mode: 'insensitive' } },
                            ]
                        }
                    };
                }

                const [records, totalCount] = await Promise.all([
                    AttendanceRepository.getWorkspaceRecords(where, skip, pageSize),
                    AttendanceRepository.countRecords(where)
                ]);

                if (!filters?.status || filters.status === AttendanceStatus.ON_LEAVE) {
                    const approvedLeaves = await (getDb() as any).leave_request.findMany({
                        where: {
                            workspaceId,
                            status: "APPROVED",
                            ...(startDate && endDate ? { startDate: { lte: endDate }, endDate: { gte: startDate } } : {}),
                            ...(finalMemberIdFilter ? { workspaceMemberId: finalMemberIdFilter } : (allowedMemberIds ? { workspaceMemberId: { in: allowedMemberIds } } : {})),
                            ...(filters?.search ? {
                                WorkspaceMember: {
                                    user: {
                                        OR: [
                                            { name: { contains: filters.search, mode: 'insensitive' } },
                                            { surname: { contains: filters.search, mode: 'insensitive' } },
                                            { email: { contains: filters.search, mode: 'insensitive' } },
                                        ]
                                    }
                                }
                            } : {})
                        },
                        include: {
                            WorkspaceMember: {
                                include: { user: { select: { surname: true, email: true } } }
                            }
                        }
                    });

                    const syntheticRecords: any[] = [];
                    const existingKeys = new Set(records.map(r => `${r.workspaceMemberId}_${r.date.toISOString().split('T')[0]}`));

                    for (const leave of approvedLeaves) {
                        let current = new Date(Math.max(new Date(leave.startDate).getTime(), startDate?.getTime() || 0));
                        const last = new Date(Math.min(new Date(leave.endDate).getTime(), endDate?.getTime() || Infinity));
                        let iterations = 0;

                        while (current <= last && iterations < 100) {
                            const dateOnly = getISTDateOnly(current);
                            const key = `${leave.workspaceMemberId}_${dateOnly.toISOString().split('T')[0]}`;

                            if (!existingKeys.has(key)) {
                                syntheticRecords.push({
                                    id: `leave-${leave.id}-${dateOnly.toISOString()}`,
                                    date: dateOnly,
                                    status: AttendanceStatus.ON_LEAVE,
                                    workspaceId,
                                    workspaceMemberId: leave.workspaceMemberId,
                                    WorkspaceMember: leave.WorkspaceMember,
                                    isOvertime: false
                                });
                                existingKeys.add(key);
                            }
                            current.setDate(current.getDate() + 1);
                            iterations++;
                        }
                    }

                    const combined = [...records, ...syntheticRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    return { data: combined, totalCount: totalCount + syntheticRecords.length };
                }

                return { data: records, totalCount };
            })();
    }

    /**
     * Update an attendance record (Strict Admin/Owner use)
     */
    static async updateAttendance(id: string, data: any, actorId: string, workspaceId: string) {
        const actor = await getDb().workspaceMember.findFirst({
            where: { workspaceId, userId: actorId },
            select: { workspaceRole: true }
        });

        if (!actor || (actor.workspaceRole !== WorkspaceRole.OWNER && actor.workspaceRole !== WorkspaceRole.ADMIN)) {
            throw AppError.Forbidden("Only Owners and Admins are permitted to edit attendance records.");
        }

        const existing = await getDb().attendance.findUnique({ where: { id } });
        if (!existing) throw AppError.NotFound("Attendance record not found.");

        const updateData: any = { ...data };
        const checkIn = data.checkIn ? new Date(data.checkIn) : existing.checkIn;
        const lateThreshold = data.lateThreshold || existing.lateThreshold || "09:40";

        if (checkIn && lateThreshold) {
            const [lateH, lateM] = lateThreshold.split(":").map(Number);
            const istDate = new Date(checkIn.getTime() + (5.5 * 60 * 60 * 1000));
            updateData.status = (istDate.getUTCHours() > lateH || (istDate.getUTCHours() === lateH && istDate.getUTCMinutes() > lateM))
                ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
        }

        const checkOut = data.checkOut ? new Date(data.checkOut) : existing.checkOut;
        const overtimeThreshold = data.overtimeThreshold || existing.overtimeThreshold || "19:00";

        if (checkOut && overtimeThreshold) {
            const [otH, otM] = overtimeThreshold.split(":").map(Number);
            const istDate = new Date(checkOut.getTime() + (5.5 * 60 * 60 * 1000));
            updateData.isOvertime = istDate.getUTCHours() > otH || (istDate.getUTCHours() === otH && istDate.getUTCMinutes() >= otM);
        }

        const updated = await AttendanceRepository.update(id, updateData);
        await AttendanceEvents.emitAdminUpdate(actorId, workspaceId, id, existing, updated);
        return updated;
    }

    /**
     * Update workspace attendance settings
     */
    static async updateSettings(
        workspaceId: string,
        data: UpdateSettingsParams,
        actorId: string,
    ) {
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        ["lateThreshold", "overtimeThreshold", "halfDayThreshold", "shiftStartTime", "shiftEndTime"].forEach(f => {
            const val = (data as any)[f];
            if (val && !timeRegex.test(val)) throw AppError.ValidationError(`Invalid time for ${f}.`);
        });

        return await getDb().$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `UPDATE "public"."Workspace" SET "lateThreshold"=$1, "overtimeThreshold"=$2, "halfDayThreshold"=$3, "shiftStartTime"=$4, "shiftEndTime"=$5, "sickLeaveLimit"=$6, "casualLeaveAccrualDays"=$7, "updatedAt"=NOW() WHERE "id"=$8`,
                data.lateThreshold, data.overtimeThreshold, data.halfDayThreshold, data.shiftStartTime, data.shiftEndTime || data.overtimeThreshold, data.sickLeaveLimit ?? 12, data.casualLeaveAccrualDays ?? 20, workspaceId
            );

            if (data.publicHolidays) {
                await tx.public_holiday.deleteMany({ where: { workspaceId } });
                if (data.publicHolidays.length > 0) {
                    await tx.public_holiday.createMany({
                        data: data.publicHolidays.map(h => ({ workspaceId, name: h.name, date: new Date(h.date) }))
                    });
                }
            }

            if (data.attendanceLocations) {
                await tx.attendanceLocation.deleteMany({ where: { workspaceId } });
                if (data.attendanceLocations.length > 0) {
                    await tx.attendanceLocation.createMany({
                        data: data.attendanceLocations.map(l => ({
                            workspaceId,
                            name: l.name,
                            address: l.address,
                            latitude: l.latitude,
                            longitude: l.longitude,
                            radius: l.radius
                        }))
                    });
                }
            }

            const actor = await tx.user.findUnique({ where: { id: actorId }, select: { surname: true } });
            await recordActivity(getDb(), {
                userId: actorId,
                userName: actor?.surname || "Admin",
                workspaceId,
                action: "ATTENDANCE_SETTINGS_UPDATED",
                entityType: "WORKSPACE",
                entityId: workspaceId,
                newData: data,
                broadcastEvent: "workspace_update",
            });

            return tx.workspace.findUnique({ where: { id: workspaceId } });
        });
    }

    /**
     * Find nearby attendance location with dynamic GPS accuracy filtering
     */
    private static async findNearbyLocation(workspaceId: string, lat: number, lng: number, accuracy = 0) {
        const locations = await getDb().attendanceLocation.findMany({
            where: { workspaceId }
        });

        for (const loc of locations) {
            const rawDistance = this.calculateDistance(lat, lng, loc.latitude, loc.longitude);
            // Subtract accuracy error margin from the raw distance to get the effective distance
            const effectiveDistance = Math.max(0, rawDistance - accuracy);
            if (effectiveDistance <= loc.radius) {
                return loc;
            }
        }
        return null;
    }

    /**
     * Calculate distance between two points in meters (Haversine formula)
     */
    private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
}
