import { Suspense } from "react";
import { getProjectMetadata } from "@/data/project/get-project-metadata";
import ProjectHeader from "./_components/layout/project-header";
import { TaskPageWrapper } from "@/app/w/[workspaceId]/_components/shared/task-page-wrapper";
import { ProjectHeaderSkeleton } from "./_components/layout/project-header-skeleton";

/**
 * Project Layout
 *
 * IMPORTANT: This layout ONLY provides structure.
 * It does NOT fetch business data (tasks, members lists, etc.)
 *
 * Data fetching happens in:
 * - page.tsx for initial page data
 * - Individual view components for their specific data
 * - Server Actions for mutations and lazy loading
 */

/**
 * Async server component that fetches project metadata and renders the header.
 * By isolating the await here inside a Suspense boundary, the layout shell
 * renders INSTANTLY and the header streams in — no blocking.
 */
async function ProjectHeaderLoader({
    workspaceId,
    slug,
}: {
    workspaceId: string;
    slug: string;
}) {
    const project = await getProjectMetadata(workspaceId, slug);

    if (!project) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-semibold">Access Denied</h1>
                <p className="text-muted-foreground">
                    You don&apos;t have permission to access this project or it doesn&apos;t exist.
                </p>
            </div>
        );
    }

    return (
        <ProjectHeader
            workspaceId={workspaceId}
            slug={slug}
            projectId={project.id}
            projectName={project.name}
            projectColor={project.color}
            userId={project.userId}
            canPerformBulkOperations={project.canPerformBulkOperations}
        />
    );
}

export default async function ProjectLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{
        workspaceId: string;
        slug: string;
    }>;
}) {
    const { workspaceId, slug } = await params;

    return (
        <TaskPageWrapper>
            <div className="flex flex-col gap-6 pb-3 px-3 h-full">
                {/* Header streams in without blocking page content */}
                <Suspense fallback={<ProjectHeaderSkeleton />}>
                    <ProjectHeaderLoader workspaceId={workspaceId} slug={slug} />
                </Suspense>

                <div className="flex-1">{children}</div>
            </div>
        </TaskPageWrapper>
    );
}
