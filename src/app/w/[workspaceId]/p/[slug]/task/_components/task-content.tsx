import { getUserProjects, UserProjectsType } from "@/app/data/user/get-user-projects";
import { Suspense } from "react";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { CreateTaskForm } from "./forms/create-task-form";
import { TaskTableSkeleton } from "./task-page-skeleton";
import { TaskTableContainer } from "./task-table-container";

interface TaskContentProps {
    workspaceId: string;
    slug: string;
}

export async function TaskContent({ workspaceId, slug }: TaskContentProps) {
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-semibold">Project Not Found</h1>
                <p className="text-muted-foreground">
                    The project you're looking for doesn't exist.
                </p>
            </div>
        );
    }

    // Fetch members and permissions in parallel
    const [projectMembers, userPermissions] = await Promise.all([
        getProjectMembers(project.id),
        getUserPermissions(workspaceId, project.id),
    ]);

    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <CreateTaskForm projectId={project.id} />
            </div>
            <div>
                <Suspense fallback={<TaskTableSkeleton />}>
                    <TaskTableContainer
                        workspaceId={workspaceId}
                        projectId={project.id}
                        members={projectMembers}
                        canCreateSubTask={userPermissions.canCreateSubTask}
                    />
                </Suspense>
            </div>
        </>
    );
}
