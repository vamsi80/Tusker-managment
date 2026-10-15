import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

import { LeavesTable } from "./_components/leaves-table";
import { requireUser } from "@/lib/auth/require-user";
import { LeaveService } from "@tusker/core/server/services/leave/index";
import db from "@tusker/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Palmtree, Thermometer, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

interface LeavesPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function LeavesContent({ workspaceId }: { workspaceId: string }) {
    const user = await requireUser();

    const [permissions, balances, profile] = await Promise.all([
        getWorkspacePermissions(workspaceId, user.id),
        LeaveService.getMemberBalances(workspaceId, user.id),
        db.workspaceMember.findFirst({
            where: { workspaceId, userId: user.id },
            select: {
                designation: true,
                employeeId: true,
                workspaceRole: true,
                department: { select: { name: true } },
                reportTo: { select: { user: { select: { surname: true, name: true } } } },
                user: { select: { name: true, surname: true, image: true } },
            },
        }),
    ]);

    const displayName = profile?.user.name || profile?.user.surname || "You";
    const accrued = balances?.accruedDaysCount || 0;
    const threshold = balances?.accrualThreshold || 20;
    const days = (n: number) => `${n} ${n === 1 ? "Day" : "Days"}`;

    const facts = [
        { label: "Designation", value: profile?.designation },
        { label: "Department", value: profile?.department?.name },
        { label: "Reports To", value: profile?.reportTo?.user.surname || profile?.reportTo?.user.name },
        { label: "Role", value: profile?.workspaceRole?.toLowerCase().replace("_", " ") },
    ];

    return (
        <div className="flex flex-col gap-4">
            {/* Your profile and leave balances */}
            <div className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-xs dark:bg-card">
                <div className="flex items-center gap-4">
                    <Avatar className="size-12">
                        <AvatarImage src={profile?.user.image || ""} alt={displayName} />
                        <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="font-medium">{displayName}</p>
                        {profile?.employeeId && <p className="text-sm text-muted-foreground"># {profile.employeeId}</p>}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-y-4 rounded-full bg-muted px-6 py-4 shadow-inner md:grid-cols-4 md:divide-x md:divide-border max-md:rounded-2xl">
                    {facts.map((f) => (
                        <div key={f.label} className="md:px-6">
                            <p className="text-sm text-muted-foreground">{f.label}</p>
                            <p className="font-medium capitalize">{f.value || "—"}</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-4">
                    <div className="flex min-w-48 items-center gap-4 rounded-2xl border px-5 py-4">
                        <Palmtree className="size-6 text-info" />
                        <div>
                            <p className="text-sm">Casual Leave</p>
                            <p className="text-sm">{days(balances?.casualLeaveBalance || 0)}</p>
                        </div>
                    </div>
                    <div className="flex min-w-48 items-center gap-4 rounded-2xl border px-5 py-4">
                        <Thermometer className="size-6 text-destructive" />
                        <div>
                            <p className="text-sm">Sick Leave</p>
                            <p className="text-sm">{days(balances?.sickLeaveBalance || 0)}</p>
                        </div>
                    </div>
                    <div
                        className="flex min-w-48 items-center gap-4 rounded-2xl border px-5 py-4"
                        title="Days towards the next casual leave credit"
                    >
                        <TrendingUp className="size-6 text-success" />
                        <div>
                            <p className="text-sm">Accrual Progress</p>
                            <p className="text-sm">{accrued}/{threshold}</p>
                            <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-success transition-all duration-1000"
                                    style={{ width: `${Math.min((accrued / threshold) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl bg-white/60 p-4 dark:bg-card/60">
                <LeavesTable
                    workspaceId={workspaceId}
                    isWorkspaceAdmin={permissions.isWorkspaceAdmin}
                    workspaceRole={permissions.workspaceRole}
                    currentMemberId={permissions.workspaceMemberId}
                />
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
