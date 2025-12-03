import { Suspense } from "react";
import { TaskHeader } from "./_components/task-header";
import { TaskTable } from "./_components/task-table";
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/task-page-skeleton";

interface iAppProps {
    params: { workspaceId: string; slug: string }
}

export default async function ProjectTask({ params }: iAppProps) {
    const { workspaceId, slug } = await params;

    return (
        <>
            <Suspense fallback={<TaskHeaderSkeleton />}>
                <TaskHeader workspaceId={workspaceId} slug={slug} />
            </Suspense>

            <div>
                <Suspense fallback={<TaskTableSkeleton />}>
                    <TaskTable workspaceId={workspaceId} slug={slug} />
                </Suspense>
            </div>
        </>
    );
}
