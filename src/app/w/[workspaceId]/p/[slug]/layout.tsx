import { getUserProjects } from "@/app/data/user/get-user-projects";
import { ProjectNav } from "../_components/project-nav";

interface Props {
    children: React.ReactNode;
    params: { workspaceId: string; slug: string };
}

export default async function ProjectLayout({ children, params }: Props) {
    const { workspaceId, slug } = await params;
    const userProjects = await getUserProjects(workspaceId);
    const project = userProjects.find((p) => p.slug === slug || p.id === slug);

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
        <div className="flex flex-col gap-6 pb-3 px-3 h-full">
            <div>
                <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
                    {project.name}
                </h1>
                <p className="text-muted-foreground">Here you can manage your project</p>
            </div>

            <ProjectNav workspaceId={workspaceId} slug={slug} />

            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}