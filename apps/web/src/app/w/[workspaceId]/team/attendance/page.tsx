import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { AttendanceTable } from "./_components/attendance-table";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

interface AttendancePageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ page?: string; pageSize?: string; from?: string; to?: string; memberId?: string; status?: string }>;
}

async function AttendanceContent({ workspaceId }: { workspaceId: string }) {
    const { data: permissions } = await serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean; workspaceRole: string | null } }>(
        `/workspaces/${workspaceId}/permissions`
    ).catch(() => ({ data: { isWorkspaceAdmin: false, workspaceRole: null } }));

    return (
        <div className="flex flex-col gap-6">
            <AttendanceTable
                workspaceId={workspaceId}
                isWorkspaceAdmin={permissions.isWorkspaceAdmin}
                workspaceRole={permissions.workspaceRole as "OWNER" | "ADMIN" | "MANAGER" | "MEMBER"}
            />
        </div>
    );
}

export default async function AttendancePage({ params }: AttendancePageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <Suspense fallback={<AppLoader />}>
                <AttendanceContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
