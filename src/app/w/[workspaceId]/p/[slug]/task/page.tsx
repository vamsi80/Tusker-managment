import { Suspense } from "react";
import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/task-page-skeleton";
import { TaskPageWrapper } from "./_components/task-page-wrapper";
import { getUserProjects, UserProjectsType } from "@/app/data/user/get-user-projects";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { CreateTaskForm } from "./_components/forms/create-task-form";
import { BulkCreateTaskForm } from "./_components/forms/bulk-create-task-form";
import { TaskTableContainer } from "./_components/task-table-container";
import { Skeleton } from "@/components/ui/skeleton";
import { ReloadButton } from "./_components/reload-button";
import { ReloadableTaskTable } from "./_components/reloadable-task-table";

interface iAppProps {
    params: { workspaceId: string; slug: string }
}

/**
 * Async component that fetches project data and renders the header
 * This is wrapped in Suspense so the page shell loads instantly
 */
async function TaskHeader({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return (
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-destructive">Project Not Found</h1>
            </div>
        );
    }

    // Get user permissions using the centralized function
    const permissions = await getUserPermissions(workspaceId, project.id);

    return (
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Your Tasks</h1>
            <div className="flex items-center gap-3">
                <ReloadButton />
                {/* Only show Create and Bulk Upload for ADMINs and LEADs */}
                {permissions.canPerformBulkOperations && (
                    <>
                        <BulkCreateTaskForm projectId={project.id} />
                        <CreateTaskForm projectId={project.id} />
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * Async component that fetches all required data and renders the task table
 * This is wrapped in Suspense with a skeleton fallback
 */
async function TaskTableWithData({ workspaceId, slug }: { workspaceId: string; slug: string }) {
    // First get project info
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                The project you're looking for doesn't exist.
            </div>
        );
    }

    // Fetch members and permissions in parallel - these are cached so fast on repeat visits
    const [projectMembers, userPermissions] = await Promise.all([
        getProjectMembers(project.id),
        getUserPermissions(workspaceId, project.id),
    ]);

    return (
        <TaskTableContainer
            workspaceId={workspaceId}
            projectId={project.id}
            members={projectMembers}
            canCreateSubTask={userPermissions.canCreateSubTask}
        />
    );
}

/**
 * Task Page - Uses Progressive Loading Pattern
 * 
 * Navigation Flow:
 * 1. User clicks link → Page INSTANTLY shows with skeleton loaders (~10ms)
 * 2. TaskHeader loads → Shows "Your Tasks" + Create button (cached: ~5ms, uncached: ~100ms)
 * 3. TaskTableWithData loads → Shows task table (cached: ~10ms, uncached: ~200-500ms)
 * 
 * Result: Navigation feels INSTANT, data streams in progressively!
 */
export default async function ProjectTask({ params }: iAppProps) {
    const { workspaceId, slug } = await params;

    return (
        <TaskPageWrapper>
            {/* Task Header - loads fast, shows skeleton while fetching */}
            <Suspense fallback={<TaskHeaderSkeleton />}>
                <TaskHeader workspaceId={workspaceId} slug={slug} />
            </Suspense>

            {/* Task Table - loads independently, shows table skeleton while fetching */}
            <ReloadableTaskTable>
                <div>
                    <Suspense fallback={<TaskTableSkeleton />}>
                        <TaskTableWithData workspaceId={workspaceId} slug={slug} />
                    </Suspense>
                </div>
            </ReloadableTaskTable>
        </TaskPageWrapper>
    );
}

