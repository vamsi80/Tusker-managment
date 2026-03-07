import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceTasksHeader } from "./_components/workspace-tasks-header";
import { TaskPageWrapper } from "../_components/shared/task-page-wrapper";

interface Props {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

function HeaderSkeleton() {
    return (
        <div className="flex items-center justify-between gap-3 mb-4">
            <Skeleton className="h-7 sm:h-9 w-36 sm:w-52" />
            <div className="flex items-center gap-1.5 sm:gap-2">
                <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-md" />
                <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-md" />
            </div>
        </div>
    );
}

export default async function WorkspaceTasksLayout({ children, params }: Props) {
    const { workspaceId } = await params;

    return (
        <TaskPageWrapper>
            <div className="flex flex-col gap-4 pt-0 pb-3 px-0 h-full">
                <Suspense fallback={<HeaderSkeleton />}>
                    <WorkspaceTasksHeader workspaceId={workspaceId} />
                </Suspense>
                {children}
            </div>
        </TaskPageWrapper>
    );
}
