import { Suspense } from "react";
import { TaskPageWrapper } from "../_components/shared/task-page-wrapper";
import { WorkspaceTasksHeader } from "./_components/workspace-tasks-header";

interface Props {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceTasksLayout({ children, params }: Props) {
    const { workspaceId } = await params;

    return (
        <TaskPageWrapper>
            <div className="flex flex-col gap-4 pt-0 pb-3 px-0 h-full">
                <Suspense fallback={null}>
                    <WorkspaceTasksHeader workspaceId={workspaceId} />
                </Suspense>
                <div className="flex flex-1 min-h-0 flex-col surface p-4 sm:p-5">{children}</div>
            </div>
        </TaskPageWrapper>
    );
}
