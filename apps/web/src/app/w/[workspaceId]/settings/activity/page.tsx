import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { ActivityList } from "./_components/activity-list";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

interface ActivityPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function ActivityContent({ workspaceId }: { workspaceId: string }) {
    try {
        const { data: logs } = await serverApiFetch<{ success: boolean; data: any[] }>(
            `/workspaces/${workspaceId}/activity`
        );
        return <ActivityList logs={logs} workspaceId={workspaceId} />;
    } catch {
        return (
            <div className="p-4 border border-destructive/50 bg-destructive/5 text-destructive rounded-md text-sm">
                You do not have permission to view this page.
            </div>
        );
    }
}

export default async function ActivityPage({ params }: ActivityPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <Suspense fallback={<AppLoader />}>
                <ActivityContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
