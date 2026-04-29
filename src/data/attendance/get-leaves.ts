import { cache } from "react";
import prisma from "@/lib/db";

export type LeaveRequestWithMember = {
    id: string;
    startDate: Date;
    endDate: Date;
    reason: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    type: "CASUAL" | "SICK";
    createdAt: Date;
    WorkspaceMember: {
        user: {
            name: string;
            surname: string | null;
            email: string;
            image: string | null;
        };
    };
};

export const getWorkspaceLeaves = cache(async (workspaceId: string): Promise<LeaveRequestWithMember[]> => {
    try {
        return await (prisma as any).leave_request.findMany({
            where: { workspaceId },
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
            orderBy: { createdAt: "desc" }
        });
    } catch (error) {
        console.error("Error fetching workspace leaves:", error);
        return [];
    }
});

export const getMemberBalances = cache(async (workspaceId: string, userId: string) => {
    try {
        const [member, workspace] = await Promise.all([
            prisma.workspaceMember.findFirst({
                where: { workspaceId, userId },
                select: {
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
    } catch (error) {
        console.error("Error fetching member balances:", error);
        return null;
    }
});
