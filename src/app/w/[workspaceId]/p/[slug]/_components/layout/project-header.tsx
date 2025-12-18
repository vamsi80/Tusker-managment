import { getTaskPageData } from "@/data/task";
import { ProjectNav } from "./project-nav";
import { ReloadButton } from "../shared/reload-button";
import { CreateTaskForm } from "../forms/create-task-form";
import { BulkUploadForm } from "../forms/bulk-upload-form";

interface ProjectHeaderProps {
    workspaceId: string;
    slug: string;
}

async function ProjectHeader({ workspaceId, slug }: ProjectHeaderProps) {
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
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                        {pageData.project.name}
                    </h1>
                    <p className="text-muted-foreground">Manage your project tasks</p>
                </div>

                <div className="flex items-center gap-3">
                    <ReloadButton projectId={pageData.project.id} userId={pageData.user.id} />
                    {pageData.permissions.canPerformBulkOperations && (
                        <>
                            <BulkUploadForm projectId={pageData.project.id} />
                            <CreateTaskForm projectId={pageData.project.id} />
                        </>
                    )}
                </div>
            </div>

            <ProjectNav workspaceId={workspaceId} slug={slug} />
        </>
    );
}

export default ProjectHeader;
