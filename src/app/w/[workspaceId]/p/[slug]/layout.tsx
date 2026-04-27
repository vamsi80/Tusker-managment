import { ProjectNav } from "./_components/layout/project-nav";
import { TaskPageWrapper } from "@/app/w/[workspaceId]/_components/shared/task-page-wrapper";
import { ProjectLayoutProvider } from "./_components/project-layout-context";
import { ProjectService } from "@/server/services/project.service";
import { requireUser } from "@/lib/auth/require-user";
import ProjectNotFound from "./_components/layout/project-not-found";

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
    const user = await requireUser();
    const project = await ProjectService.getProjectMetadata(workspaceId, slug, user.id);

    if (!project) {
        return <ProjectNotFound workspaceId={workspaceId} />;
    }


    return (
        <ProjectLayoutProvider workspaceId={workspaceId} projectId={project.id}>
            <TaskPageWrapper>
                <div className="flex flex-col gap-0 pb-3 px-0 h-full">
                    <ProjectNav
                        workspaceId={workspaceId}
                        slug={slug}
                        projectId={project.id}
                        projectName={project.name}
                        projectColor={project.color}
                        userRole={project.userRole}
                        canPerformBulkOperations={project.canPerformBulkOperations}
                    />
                    <div className="flex-1 mt-3">{children}</div>
                </div>
            </TaskPageWrapper>
        </ProjectLayoutProvider>
    );
}
