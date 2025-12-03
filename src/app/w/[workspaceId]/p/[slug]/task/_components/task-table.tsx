import { getUserProjects, UserProjectsType } from "@/app/data/user/get-user-projects";
import { getProjectTasks } from "@/app/data/task/get-project-tasks";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { TaskData } from "./taskData";

interface TaskTableProps {
    workspaceId: string;
    slug: string;
}

export async function TaskTable({ workspaceId, slug }: TaskTableProps) {
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

    // Fetch initial page of tasks and other data in parallel
    const [tasksData, projectMembers, userPermissions] = await Promise.all([
        getProjectTasks(project.id, 1, 10), // First page, 10 items
        getProjectMembers(project.id),
        getUserPermissions(workspaceId, project.id),
    ]);

    return (
        <TaskData
            initialTasksData={tasksData}
            members={projectMembers}
            workspaceId={workspaceId}
            projectId={project.id}
            canCreateSubTask={userPermissions.canCreateSubTask}
        />
    );
}
