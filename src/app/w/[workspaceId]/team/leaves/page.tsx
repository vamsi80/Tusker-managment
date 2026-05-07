import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

import { LeavesTable } from "./_components/leaves-table";
import { LeaveRequestDialog } from "../_components/leave-request-dialog";
import { requireUser } from "@/lib/auth/require-user";
import { LeaveService } from "@/server/services/leave";
import { Coffee, Thermometer, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

interface LeavesPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function LeavesContent({ workspaceId }: { workspaceId: string }) {
    const user = await requireUser();

    const [permissions, balances] = await Promise.all([
        getWorkspacePermissions(workspaceId, user.id),
        LeaveService.getMemberBalances(workspaceId, user.id),
    ]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full order-2 xl:order-1">
                    <LeavesTable
                        workspaceId={workspaceId}
                        isWorkspaceAdmin={permissions.isWorkspaceAdmin}
                        workspaceRole={permissions.workspaceRole}
                        currentMemberId={permissions.workspaceMemberId}
                    />
                </div>

                <div className="w-full xl:w-[320px] flex flex-col gap-4 order-1 xl:order-2 sticky top-6">
                    <div className="flex flex-col gap-4 p-4 rounded-xl border bg-card/30 backdrop-blur-md shadow-sm border-muted-foreground/5">
                        <div className="space-y-1 px-1">
                            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Your Balances</h3>
                        </div>

                        <div className="grid grid-cols-2 xl:grid-cols-1 gap-3">
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                    <Coffee className="h-4 w-4 text-blue-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest truncate">Casual</p>
                                    <p className="text-base font-normal text-blue-900">{balances?.casualLeaveBalance || 0} <span className="text-[10px] opacity-40">DAYS</span></p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                                <div className="h-9 w-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                                    <Thermometer className="h-4 w-4 text-rose-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest truncate">Sick</p>
                                    <p className="text-base font-normal text-rose-900">{balances?.sickLeaveBalance || 0} <span className="text-[10px] opacity-40">DAYS</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-muted-foreground/5">
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest">Accrual Progress</p>
                                        <p className="text-[10px] font-normal text-emerald-600 uppercase tracking-tighter truncate">
                                            {balances?.accruedDaysCount || 0} / {balances?.accrualThreshold || 20}
                                        </p>
                                    </div>
                                </div>
                                <div className="h-2 w-full bg-emerald-100/50 rounded-full overflow-hidden p-0.5 border border-emerald-500/5">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min(((balances?.accruedDaysCount || 0) / (balances?.accrualThreshold || 20)) * 100, 100)}%` }}
                                    />
                                </div>
                                <p className="text-[9px] text-muted-foreground text-center italic">Days towards next casual leave credit</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
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
