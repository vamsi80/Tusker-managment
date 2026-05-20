import db from "@/lib/db";
import { ProjectProcurementClient } from "./project-procurement-client";

export async function ProjectProcurementView({
  workspaceId,
  projectId,
  userId
}: {
  workspaceId: string;
  projectId: string;
  userId: string;
}) {
  const indents = await db.indent.findMany({
    where: { projectId },
    include: {
      requestedBy: { select: { user: { select: { name: true, surname: true } } } },
      task: { select: { name: true, taskSlug: true } },
      lineItems: { select: { id: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  // fetch tasks for dropdown in the create form
  const tasks = await db.task.findMany({
    where: { projectId },
    select: { id: true, name: true, taskSlug: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="h-full flex flex-col p-4 md:p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Procurement</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage material requests and indents for this project.
          </p>
        </div>
      </div>

      <ProjectProcurementClient
        workspaceId={workspaceId}
        projectId={projectId}
        indents={indents}
        tasks={tasks}
      />
    </div>
  );
}
