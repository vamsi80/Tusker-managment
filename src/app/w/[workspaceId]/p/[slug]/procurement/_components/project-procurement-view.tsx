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

  const tasks = await db.task.findMany({
    where: { projectId },
    select: { id: true, name: true, taskSlug: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectProcurementClient
        workspaceId={workspaceId}
        projectId={projectId}
        indents={indents}
        tasks={tasks}
      />
    </div>
  );
}
