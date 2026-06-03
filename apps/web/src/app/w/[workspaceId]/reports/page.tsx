import { ReportService } from "@/server/services/report.service";
import { notFound } from "next/navigation";
import { ReportsTable } from "./_components/report-table";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

export default async function ReportsPage({
    params,
    searchParams
}: {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ date?: string; userId?: string }>;
}) {
    const { workspaceId } = await params;
    const { isWorkspaceAdmin, workspaceMemberId, userId } = await getWorkspacePermissions(workspaceId);

    if (!workspaceMemberId) {
        return notFound();
    }

    const search = await searchParams;

    const rows = await ReportService.getReports({
        workspaceId,
        date: search.date,
        userId: search.userId,
        isWorkspaceAdmin,
        currentWorkspaceMemberId: workspaceMemberId,
        take: 30,
        skip: 0
    });

    return (
        <div className="flex flex-col gap-6">
            <ReportsTable
                initialData={rows}
                workspaceId={workspaceId}
                initialDate={search.date}
                initialUserId={search.userId}
                isAdmin={isWorkspaceAdmin}
                currentUserId={userId}
            />
        </div>
    );
}
