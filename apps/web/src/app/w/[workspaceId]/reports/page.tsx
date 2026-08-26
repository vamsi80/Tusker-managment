import { ReportService } from "@/server/services/report.service";
import { notFound } from "next/navigation";
import { ReportsTable } from "./_components/report-table";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

const parseUserIds = (value?: string): string[] => {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return (Array.isArray(parsed) ? parsed : [parsed]).map(String).filter(Boolean);
    } catch {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
};

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
    const selectedUserIds = parseUserIds(search.userId);

    const rows = await ReportService.getReports({
        workspaceId,
        date: search.date,
        userId: selectedUserIds.length > 0 ? selectedUserIds : undefined,
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
                initialUserIds={selectedUserIds}
                isAdmin={isWorkspaceAdmin}
                currentUserId={userId}
            />
        </div>
    );
}
