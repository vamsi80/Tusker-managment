import { Suspense } from "react";
import ProjectHeader from "./_components/layout/project-header";
import { ProjectLayoutSkeleton } from "./_components/layout/project-layout-skeleton";
import { TaskPageWrapper } from "./_components/shared/task-page-wrapper";

interface Props {
    children: React.ReactNode;
    params: { workspaceId: string; slug: string };
}

export default async function ProjectLayout({ children, params }: Props) {
    const { workspaceId, slug } = await params;

    return (
        <TaskPageWrapper>
            <div className="flex flex-col gap-6 pb-3 px-3 h-full">
                <Suspense fallback={<ProjectLayoutSkeleton />}>
                    <ProjectHeader workspaceId={workspaceId} slug={slug} />
                </Suspense>

                <div className="flex-1">
                    {children}
                </div>
            </div>
        </TaskPageWrapper>
    );
}