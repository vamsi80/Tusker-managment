import prisma from "@tusker/db";

export class AttendanceRepository {
    static async findByMemberAndDate(workspaceMemberId: string, date: Date) {
        return await prisma.attendance.findUnique({
            where: {
                workspaceMemberId_date: {
                    workspaceMemberId,
                    date,
                }
            }
        });
    }

    static async upsert(where: any, create: any, update: any) {
        return await (prisma.attendance as any).upsert({
            where,
            create,
            update,
            include: {
                WorkspaceMember: {
                    include: {
                        user: {
                            select: {
                                surname: true,
                                email: true,
                            }
                        }
                    }
                }
            }
        });
    }

    static async update(id: string, data: any) {
        return await (prisma.attendance as any).update({
            where: { id },
            data,
            include: {
                WorkspaceMember: {
                    include: {
                        user: {
                            select: {
                                surname: true,
                                email: true,
                            }
                        }
                    }
                }
            }
        });
    }

    static async getWorkspaceRecords(where: any, skip: number, take: number) {
        return await prisma.attendance.findMany({
            where,
            include: {
                WorkspaceMember: {
                    include: {
                        user: {
                            select: {
                                surname: true,
                                email: true,
                            }
                        }
                    }
                }
            },
            // Newest day first, and within a day the most recent check-in leads.
            // Rows with no check-in (absent / on leave) have a null time and sit at
            // the bottom of their day; id breaks the tie so paging stays stable.
            orderBy: [
                { date: 'desc' },
                { checkIn: { sort: 'desc', nulls: 'last' } },
                { id: 'asc' }
            ],
            skip,
            take
        });
    }

    static async countRecords(where: any) {
        return await prisma.attendance.count({ where });
    }
}
