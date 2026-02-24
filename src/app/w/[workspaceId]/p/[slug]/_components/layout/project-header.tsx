"use client";

import { ProjectNav } from "./project-nav";
import { ReloadButton } from "../shared/reload-button";
import { CreateTaskForm } from "../forms/create-task-form";
import { BulkUploadForm } from "../forms/bulk-upload-form";

interface ProjectHeaderProps {
    workspaceId: string;
    slug: string;
    projectId: string;
    projectName: string;
    projectColor: string | null;
    userId: string;
    canPerformBulkOperations: boolean;
}

/**
 * Project Header Component
 * 
 * Receives minimal metadata as props from layout
 * Does NOT fetch data itself
 */
function ProjectHeader({
    workspaceId,
    slug,
    projectId,
    projectName,
    projectColor,
    userId,
    canPerformBulkOperations,
}: ProjectHeaderProps) {
    return (
        <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold leading-tight tracking-tighter md:text-4xl flex items-center gap-2 sm:gap-3">
                        {projectName}
                        <div
                            className="h-3 w-3 md:h-5 md:w-5 rounded-full border shadow-sm transition-colors shrink-0"
                            style={{ backgroundColor: projectColor || '#888' }}
                        />
                    </h1>
                    <p className="text-sm md:text-base text-muted-foreground">Manage your project tasks</p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <ReloadButton projectId={projectId} userId={userId} />
                    {canPerformBulkOperations && (
                        <>
                            <BulkUploadForm projectId={projectId} />
                            <CreateTaskForm
                                workspaceId={workspaceId}
                                projectId={projectId}
                            />
                        </>
                    )}
                </div>
            </div>

            <ProjectNav workspaceId={workspaceId} slug={slug} />
        </>
    );
}

export default ProjectHeader;
