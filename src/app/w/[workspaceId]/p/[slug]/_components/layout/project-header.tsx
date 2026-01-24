"use client";

import { useProject } from "@/app/w/[workspaceId]/_components/shared/task-page-context";
import { ProjectNav } from "./project-nav";
import { ReloadButton } from "../shared/reload-button";
import { CreateTaskForm } from "../forms/create-task-form";
import { BulkUploadForm } from "../forms/bulk-upload-form";
import { getColorFromString } from "@/lib/colors/project-colors";

interface ProjectHeaderProps {
    workspaceId?: string;
    slug?: string;
}

function ProjectHeader({ workspaceId, slug }: ProjectHeaderProps = {}) {
    // Get project data from context (fetched once in layout)
    const pageData = useProject();

    return (
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl flex items-center gap-3">
                        {pageData.project.name}
                        <div
                            className="h-4 w-4 md:h-5 md:w-5 rounded-full border shadow-sm transition-colors shrink-0"
                            style={{ backgroundColor: pageData.project.color }}
                        />
                    </h1>
                    <p className="text-muted-foreground">Manage your project tasks</p>
                </div>

                <div className="flex items-center gap-3">
                    <ReloadButton projectId={pageData.project.id} userId={pageData.user.id} />
                    {pageData.permissions.canPerformBulkOperations && (
                        <>
                            <BulkUploadForm projectId={pageData.project.id} />
                            <CreateTaskForm
                                workspaceId={pageData.project.workspaceId}
                                projectId={pageData.project.id}
                            />
                        </>
                    )}
                </div>
            </div>

            <ProjectNav workspaceId={workspaceId || pageData.project.workspaceId} slug={slug || pageData.project.slug} />
        </>
    );
}

export default ProjectHeader;
