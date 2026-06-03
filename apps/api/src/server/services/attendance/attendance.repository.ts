import { getDb } from "@/lib/registry";

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

    static async upsert(where: any, create: any, update: any) {
        return await (getDb().attendance as any).upsert({
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
        return await (getDb().attendance as any).update({
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

    static async countRecords(where: any) {
        return await getDb().attendance.count({ where });
    }
}
