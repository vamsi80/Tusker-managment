// app/(...)/[workspaceId]/projects/[slug]/page.tsx  (or wherever)
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getWorkspacesProjectsByWorkspaceId } from "@/app/data/workspace/get-workspace-members";
import { ProjectTaskTab } from "../_components/project-Task-Tab";

interface ProjectPageProps {
  params: { workspaceId: string; slug: string };
}

const ProjectPage = async ({ params }: ProjectPageProps) => {
  const { workspaceId, slug } = await params; // no need to await params

  // fetch projects for the workspace (or better: fetch single project by slug)
  const { projects } = await getWorkspacesProjectsByWorkspaceId(workspaceId);

  // find by slug (or if your slug is the id use p.id === slug)
  const project = projects?.find((p) => p.slug === slug || p.id === slug);

  if (!project) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="text-muted-foreground">Project with slug "{slug}" not found in this workspace.</p>
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
