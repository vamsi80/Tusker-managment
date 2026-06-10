import { Suspense } from "react";
import { WorkspaceGanttView } from "../_components/views/gantt/workspace-gantt-view";
import { AppLoader } from "@/components/shared/app-loader";
import { ReloadableView } from "@/components/shared/reloadable-view";

interface Props {
    params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceGanttPage({ params }: Props) {
    const { workspaceId } = await params;
    return (
        <ReloadableView skeleton={<AppLoader />}>
            <Suspense fallback={<AppLoader />}>
                <WorkspaceGanttView workspaceId={workspaceId} />
            </Suspense>
        </ReloadableView>
    );
}
