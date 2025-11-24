import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectDashboard } from "./_components/project-dashboard";
import {
  getWorkspacesProjectsByWorkspaceId,
} from "@/app/data/workspace/get-workspace-members";
import { ProjectTaskTab } from "./_components/project-Task-Tab";

interface ProjectPageProps {
  params: { workspaceId: string; projectId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

const ProjectPage = async ({ params, searchParams }: ProjectPageProps) => {
  const { workspaceId, projectId } = await params;

  const { projects } = await getWorkspacesProjectsByWorkspaceId(
    workspaceId
  );

  // Projects is an array; find the project that matches projectId
  const project = projects?.find(p => p.id === projectId);

  return (
    <>
      <div className="flex flex-col gap-6 pb-3 px-3">
        <div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
            {project?.name ?? "Project not found"}
          </h1>
          <p className="text-muted-foreground">Here you can manage your project</p>
        </div>

        <Tabs 
        // defaultValue={view} 
        className="w-full">
          <TabsList className="mb-4">
            <Link href="?view=dashboard">
              <TabsTrigger value="dashboard" className="px-1.5 md:px-3">
                Dashboard
              </TabsTrigger>
            </Link>

            <Link href="?view=tasks">
              <TabsTrigger value="tasks" className="px-1.5 md:px-3">
                Tasks
              </TabsTrigger>
            </Link>

            <Link href="?view=kanban">
              <TabsTrigger value="kanban" className="px-1.5 md:px-3">
                Kanban
              </TabsTrigger>
            </Link>
          </TabsList>

          <TabsContent value="dashboard">
            <ProjectDashboard /* pass props as needed: project={project} */ />
          </TabsContent>

          <TabsContent value="tasks">
            <ProjectTaskTab projectId={projectId}/>
            {/* <ProjectTableContainer projectId={projectId} /> */}
            </TabsContent>

          <TabsContent value="kanban">{/* <ProjectKanban initialTasks={...} /> */}</TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default ProjectPage;
