import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { WorkspaceTasksHeader } from "./_components/workspace-tasks-header";
import { TaskPageWrapper } from "../_components/shared/task-page-wrapper";

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
                {children}
            </div>
        </TaskPageWrapper>
    );
}
