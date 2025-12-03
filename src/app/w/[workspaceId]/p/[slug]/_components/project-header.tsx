import { getUserProjects, UserProjectsType } from "@/app/data/user/get-user-projects";
import { ProjectNav } from "../../_components/project-nav";

interface ProjectHeaderProps {
    workspaceId: string;
    slug: string;
}

async function ProjectHeader({ workspaceId, slug }: ProjectHeaderProps) {
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p: UserProjectsType[number]) => p.slug === slug || p.id === slug);

    if (!project) {
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
            <div>
                <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                    {project.name}
                </h1>
                <p className="text-muted-foreground">Here you can manage your project</p>
            </div>

            <ProjectNav workspaceId={workspaceId} slug={slug} />
        </>
    );
}

export default ProjectHeader;
