import { Suspense } from "react";
import WorkspaceKanbanView from "../_components/views/kanban/workspace-kanban-view";
import { AppLoader } from "@/components/shared/app-loader";
import { ReloadableView } from "@/components/shared/reloadable-view";

interface Props {
    params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceKanbanPage({ params }: Props) {
    const { workspaceId } = await params;
    return (
        <ReloadableView skeleton={<AppLoader />}>
            <Suspense fallback={<AppLoader />}>
                <WorkspaceKanbanView workspaceId={workspaceId} />
            </Suspense>
        </ReloadableView>
    );
}
