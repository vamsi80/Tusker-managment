import { Suspense } from "react";
import { getTaskPageData } from "@/data/task";
import ProjectHeader from "./_components/layout/project-header";
import { TaskPageWrapper } from "@/app/w/[workspaceId]/_components/shared/task-page-wrapper";
import { TaskPageProvider } from "@/app/w/[workspaceId]/_components/shared/task-page-context";
import { ProjectHeaderSkeleton } from "./_components/layout/project-header-skeleton";

interface Props {
    children: React.ReactNode;
    params: { workspaceId: string; slug: string };
}

export default async function ProjectLayout({ children, params }: Props) {
    const { workspaceId, slug } = await params;

    // Fetch project data ONCE at layout level
    const pageData = await getTaskPageData(workspaceId, slug);

    if (!pageData) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-semibold">Access Denied</h1>
                <p className="text-muted-foreground">
                    You don't have permission to access this project or it doesn't exist.
                </p>
            </div>
        );
    }

    return (
        <TaskPageProvider pageData={pageData}>
            <TaskPageWrapper>
                <div className="flex flex-col gap-6 pb-3 px-3 h-full">
                    <Suspense fallback={<ProjectHeaderSkeleton />}>
                        <ProjectHeader />
                    </Suspense>

                    <div className="flex-1">
                        {children}
                    </div>
                </div>
            </TaskPageWrapper>
        </TaskPageProvider>
    );
}