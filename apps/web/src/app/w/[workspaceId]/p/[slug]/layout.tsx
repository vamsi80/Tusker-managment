import { ProjectNav } from "./_components/layout/project-nav";
import { TaskPageWrapper } from "@/app/w/[workspaceId]/_components/shared/task-page-wrapper";
import { ProjectLayoutProvider } from "./_components/project-layout-context";
import { serverApiFetch } from "@/lib/api-client/server-fetch";
import ProjectNotFound from "./_components/layout/project-not-found";

export default async function ProjectLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string; slug: string }>;
}) {
    const { workspaceId, slug } = await params;

    const project = await serverApiFetch<{ success: boolean; data: { id: string; name: string; color: string; userRole: string; canPerformBulkOperations: boolean } | null }>(
        `/projects/slug/${slug}/metadata?workspaceId=${workspaceId}`
    ).then(r => r.data).catch(() => null);

    if (!project) {
        return <ProjectNotFound workspaceId={workspaceId} />;
    }

    return (
        <ProjectLayoutProvider workspaceId={workspaceId} projectId={project.id}>
            <TaskPageWrapper>
                <div className="flex flex-col gap-0 pb-3 px-0 h-full overflow-hidden">
                    <ProjectNav
                        workspaceId={workspaceId}
                        slug={slug}
                        projectId={project.id}
                        projectName={project.name}
                        projectColor={project.color}
                        userRole={project.userRole}
                        canPerformBulkOperations={project.canPerformBulkOperations}
                    />
                    <div className="flex-1 min-h-0 overflow-hidden mt-3">{children}</div>
                </div>
            </TaskPageWrapper>
        </ProjectLayoutProvider>
    );
}
