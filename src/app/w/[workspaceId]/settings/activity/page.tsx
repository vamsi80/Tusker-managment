import { Suspense } from "react";
import { getWorkspaceActivity } from "@/data/audit/get-activity";
import { AppLoader } from "@/components/shared/app-loader";
import { ActivityList } from "./_components/activity-list";

interface ActivityPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function ActivityContent({ workspaceId }: { workspaceId: string }) {
    try {
        const logs = await getWorkspaceActivity(workspaceId);
        return <ActivityList logs={logs} workspaceId={workspaceId} />;
    } catch (error) {
        console.error("[ACTIVITY_PAGE_ERROR]", error);
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
