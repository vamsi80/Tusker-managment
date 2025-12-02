import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectTaskTab } from "../_components/project-Task-Tab";
import { getUserProjects } from "@/app/data/user/get-user-projects";

interface ProjectPageProps {
  params: { workspaceId: string; slug: string };
}

const ProjectPage = async ({ params }: ProjectPageProps) => {
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
    <div className="flex flex-col gap-6 pb-3 px-3">
      <div>
        <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
          {project.name}
        </h1>
        <p className="text-muted-foreground">Here you can manage your project</p>
      </div>

      <Tabs className="w-full">
        <TabsList className="mb-4">
          <Link href={`?view=dashboard`} shallow>
            <TabsTrigger value="dashboard" className="px-1.5 md:px-3">Dashboard</TabsTrigger>
          </Link>

          <Link href={`?view=tasks`} shallow>
            <TabsTrigger value="tasks" className="px-1.5 md:px-3">Tasks</TabsTrigger>
          </Link>

          <Link href={`?view=kanban`} shallow>
            <TabsTrigger value="kanban" className="px-1.5 md:px-3">Kanban</TabsTrigger>
          </Link>
        </TabsList>

        <TabsContent value="dashboard">
          {/* <ProjectDashboard project={project} /> */}
        </TabsContent>

        <TabsContent value="tasks">
          {/* Pass the resolved project.id */}
          <ProjectTaskTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="kanban">{/* Kanban component here */}</TabsContent>
      </Tabs>
    </div>
  );
};

export default ProjectPage;
