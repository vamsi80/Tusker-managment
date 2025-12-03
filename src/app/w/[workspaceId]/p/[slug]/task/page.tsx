
import { CreateTaskForm } from "./_components/create-task-form"
import { getUserProjects } from "@/app/data/user/get-user-projects"
import { getProjectTasks } from "@/app/data/task/get-project-tasks";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { TaskData } from "./_components/taskData";

interface iAppProps {
    params: { workspaceId: string; slug: string }
}

export default async function ProjectTask({ params }: iAppProps) {
    const { workspaceId, slug } = await params;
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p) => p.slug === slug || p.id === slug);

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

    // Fetch tasks for this project
    const tasks = await getProjectTasks(project.id);
    const projectMembers = await getProjectMembers(project.id);
    const userPermissions = await getUserPermissions(workspaceId, project.id);


    return (
        <>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Your Tasks</h1>
                <CreateTaskForm projectId={project.id} />
            </div>
            <div>
                <TaskData
                    tasks={tasks}
                    members={projectMembers}
                    workspaceId={workspaceId}
                    projectId={project.id}
                    canCreateSubTask={userPermissions.canCreateSubTask}
                />
            </div>
        </>
    )
}
