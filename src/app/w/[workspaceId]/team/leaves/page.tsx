import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

import { LeavesTable } from "./_components/leaves-table";
import { LeaveRequestDialog } from "../_components/leave-request-dialog";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors/app-error";
import { getMemberBalances } from "@/data/attendance/get-leaves";
import { Card, CardContent } from "@/components/ui/card";
import { Coffee, Thermometer, TrendingUp, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

interface LeavesPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function LeavesContent({ workspaceId }: { workspaceId: string }) {
    const user = await requireUser();

    const [permissions, balances] = await Promise.all([
        getWorkspacePermissions(workspaceId, user.id),
        getMemberBalances(workspaceId, user.id)
    ]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-normal tracking-tight">Leaves</h2>
                    <p className="text-sm text-muted-foreground">
                        Manage leave requests and track balances.
                    </p>
                </div>
                <LeaveRequestDialog workspaceId={workspaceId} />
            </div>

            {/* Slim Balances Summary */}
            <div className="flex flex-wrap items-center gap-8 p-3 px-6 rounded-lg border bg-card/30 backdrop-blur-md shadow-sm border-muted-foreground/5 mb-2">
                <div className="flex items-center gap-3 pr-8 border-r border-muted-foreground/10">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Coffee className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest">Casual</p>
                        <p className="text-base font-normal text-blue-900">{balances?.casualLeaveBalance || 0} <span className="text-[10px] opacity-40">DAYS</span></p>
                    </div>
                </div>

                <div className="flex items-center gap-3 pr-8 border-r border-muted-foreground/10">
                    <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
                        <Thermometer className="h-5 w-5 text-rose-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest">Sick</p>
                        <p className="text-base font-normal text-rose-900">{balances?.sickLeaveBalance || 0} <span className="text-[10px] opacity-40">DAYS</span></p>
                    </div>
                </div>

                <div className="flex-1 flex items-center gap-4 min-w-[240px]">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                        <div className="flex justify-between items-end">
                            <p className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest">Accrual Progress</p>
                            <p className="text-[10px] font-normal text-emerald-600 uppercase tracking-tighter">{balances?.accruedDaysCount || 0} / {balances?.accrualThreshold || 20} <span className="opacity-40">TOWARDS CREDIT</span></p>
                        </div>
                        <div className="h-2 w-full bg-emerald-100/50 rounded-full overflow-hidden p-0.5 border border-emerald-500/5">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.min(((balances?.accruedDaysCount || 0) / (balances?.accrualThreshold || 20)) * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <LeavesTable
                workspaceId={workspaceId}
                isWorkspaceAdmin={permissions.isWorkspaceAdmin}
                workspaceRole={permissions.workspaceRole}
                currentMemberId={permissions.workspaceMemberId}
            />
        </div>
    );
}

export default async function LeavesPage({ params }: LeavesPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <Suspense fallback={<AppLoader />}>
                <LeavesContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
