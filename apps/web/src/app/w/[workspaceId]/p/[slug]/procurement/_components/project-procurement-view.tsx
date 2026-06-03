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
  const [indents, member] = await Promise.all([
    db.indent.findMany({
      where: { projectId },
      include: {
        requestedBy: { select: { user: { select: { name: true, surname: true } } } },
        task: { select: { name: true, taskSlug: true } },
        lineItems: {
          select: {
            id: true,
            materialName: true,
            unit: true,
            quantity: true,
            specifications: true,
            status: true,
          }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.workspaceMember.findFirst({
      where: { workspaceId, userId },
      select: { workspaceRole: true }
    })
  ]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectProcurementClient
        workspaceId={workspaceId}
        projectId={projectId}
        indents={indents}
        userRole={member?.workspaceRole || "MEMBER"}
      />
    </div>
  );
}
