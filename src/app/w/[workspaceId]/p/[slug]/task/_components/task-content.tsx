import { getUserProjects, UserProjectsType } from "@/app/data/user/get-user-projects";
import { getProjectTasks } from "@/app/data/task/get-project-tasks";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { CreateTaskForm } from "./create-task-form";
import { TaskData } from "./taskData";

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

    // Fetch all data in parallel for better performance
    const [tasks, projectMembers, userPermissions] = await Promise.all([
        getProjectTasks(project.id),
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
                <TaskData
                    initialTasksData={tasks}
                    members={projectMembers}
                    workspaceId={workspaceId}
                    projectId={project.id}
                    canCreateSubTask={userPermissions.canCreateSubTask}
                />
            </div>
        </>
    );
}
