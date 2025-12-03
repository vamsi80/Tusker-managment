import { getUserProjects, UserProjectsType } from "@/app/data/user/get-user-projects";
import { CreateTaskForm } from "./forms/create-task-form";

interface TaskHeaderProps {
    workspaceId: string;
    slug: string;
}

export async function TaskHeader({ workspaceId, slug }: TaskHeaderProps) {
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
        return null;
    }

    return (
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Your Tasks</h1>
            <CreateTaskForm projectId={project.id} />
        </div>
    );
}
