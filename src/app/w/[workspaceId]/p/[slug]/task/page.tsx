import { Suspense } from "react";
import { TaskHeader } from "./_components/task-header";
import { TaskTable } from "./_components/task-table";
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/task-page-skeleton";
import { TaskPageWrapper } from "./_components/task-page-wrapper";

// Prevent automatic revalidation when switching tabs
// export const revalidate = false;

interface iAppProps {
    params: { workspaceId: string; slug: string }
}

export default async function ProjectTask({ params }: iAppProps) {
    const { workspaceId, slug } = await params;

    return (
        <TaskPageWrapper>
            <Suspense fallback={<TaskHeaderSkeleton />}>
                <TaskHeader workspaceId={workspaceId} slug={slug} />
            </Suspense>

            <div>
                <Suspense fallback={<TaskTableSkeleton />}>
                    <TaskTable workspaceId={workspaceId} slug={slug} />
                </Suspense>
            </div>
        </TaskPageWrapper>
    );
}
