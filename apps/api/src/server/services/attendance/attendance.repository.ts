import { getDb } from "@/lib/registry";
import { Prisma } from "@/generated/prisma";

export class AttendanceRepository {
    static async findByMemberAndDate(workspaceMemberId: string, date: Date) {
        return await getDb().attendance.findUnique({
            where: {
                workspaceMemberId_date: {
                    workspaceMemberId,
                    date,
                }
            }
        });
    }

    static async upsert(
        where: Prisma.attendanceWhereUniqueInput,
        create: Prisma.attendanceUncheckedCreateInput,
        update: Prisma.attendanceUpdateInput
    ) {
        return await getDb().attendance.upsert({
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

    static async update(id: string, data: Prisma.attendanceUpdateInput) {
        return await getDb().attendance.update({
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

    static async getWorkspaceRecords(where: Prisma.attendanceWhereInput, skip: number, take: number) {
        return await getDb().attendance.findMany({
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
            orderBy: [
                { date: 'desc' },
                { WorkspaceMember: { position: 'asc' } }
            ],
            skip,
            take
        });
    }

    static async countRecords(where: Prisma.attendanceWhereInput) {
        return await getDb().attendance.count({ where });
    }
}
