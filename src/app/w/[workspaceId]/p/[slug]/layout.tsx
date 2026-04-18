import { Suspense } from "react";
import ProjectHeader from "./_components/layout/project-header";
import { TaskPageWrapper } from "@/app/w/[workspaceId]/_components/shared/task-page-wrapper";
import { ProjectLayoutProvider } from "./_components/project-layout-context";
import { ProjectService } from "@/server/services/project.service";
import { requireUser } from "@/lib/auth/require-user";

async function ProjectHeaderLoader({
    workspaceId,
    slug,
}: {
    workspaceId: string;
    slug: string;
}) {
    const user = await requireUser();
    const project = await ProjectService.getProjectMetadata(workspaceId, slug, user.id);

    if (!project) {
        return (
            <div className="space-y-4">
                <div className="p-6">
                    <h1 className="text-2xl font-semibold">Access Denied</h1>
                    <p className="text-muted-foreground">
                        You don&apos;t have permission to access this project or it doesn&apos;t exist.
                    </p>
                </div>
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
            userRole={project.userRole}
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
    const user = await requireUser();
    const project = await ProjectService.getProjectMetadata(workspaceId, slug, user.id);

    if (!project) {
        return (
            <div className="space-y-4">
                <div className="p-6">
                    <h1 className="text-2xl font-semibold">Access Denied</h1>
                    <p className="text-muted-foreground">
                        You don&apos;t have permission to access this project or it doesn&apos;t exist.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ProjectLayoutProvider workspaceId={workspaceId} projectId={project.id}>
            <TaskPageWrapper>
                <div className="flex flex-col gap-4 pb-3 px-0 h-full">
                    <ProjectHeader
                        workspaceId={workspaceId}
                        slug={slug}
                        projectId={project.id}
                        projectName={project.name}
                        projectColor={project.color}
                        userId={project.userId}
                        canPerformBulkOperations={project.canPerformBulkOperations}
                        userRole={project.userRole}
                    />

                    <div className="flex-1">{children}</div>
                </div>
            </TaskPageWrapper>
        </ProjectLayoutProvider>
    );
}
