import { notFound } from "next/navigation";
import { ReportsTable } from "./_components/report-table";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

export default async function ReportsPage({
    params,
    searchParams
}: {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ date?: string; userId?: string }>;
}) {
    const { workspaceId } = await params;
    const search = await searchParams;

    const [{ data: permissions }, { data: rows = [] }] = await Promise.all([
        serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean; workspaceMemberId: string | null; userId: string | null } }>(
            `/workspaces/${workspaceId}/permissions`
        ).catch(() => ({ data: { isWorkspaceAdmin: false, workspaceMemberId: null, userId: null } })),
        (() => {
            const query = new URLSearchParams({ skip: "0", take: "30" });
            if (search.date) query.set("date", search.date);
            if (search.userId) query.set("userId", search.userId);
            return serverApiFetch<{ success: boolean; data: any[] }>(
                `/reports/${workspaceId}?${query.toString()}`
            ).catch(() => ({ data: [] as any[] }));
        })(),
    ]);

    if (!permissions.workspaceMemberId) {
        return notFound();
    }

    return (
        <div className="flex flex-col gap-6">
            <ReportsTable
                initialData={rows}
                workspaceId={workspaceId}
                initialDate={search.date}
                initialUserId={search.userId}
                isAdmin={permissions.isWorkspaceAdmin}
                currentUserId={permissions.userId ?? ""}
            />
        </div>
    );
}
