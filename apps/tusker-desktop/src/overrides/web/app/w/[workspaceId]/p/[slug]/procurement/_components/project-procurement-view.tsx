// Desktop copy of apps/web/src/app/w/[workspaceId]/p/[slug]/procurement/_components/project-procurement-view.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { ProjectProcurementClient } from "@/app/w/[workspaceId]/p/[slug]/procurement/_components/project-procurement-client";
import { api } from "~/overrides/web/lib/desktop-api";

export async function ProjectProcurementView({
  workspaceId,
  projectId,
  userId
}: {
  workspaceId: string;
  projectId: string;
  userId: string;
}) {
  void userId; // the API answers for the signed-in user
  const { indents, member } = await api<{ indents: any[]; member: { id: string; workspaceRole: string } | null }>(
    "/desktop/procurement/project-indents",
    { query: { workspaceId, projectId } },
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectProcurementClient
        workspaceId={workspaceId}
        projectId={projectId}
        indents={indents}
        userRole={member?.workspaceRole || "MEMBER"}
        memberId={member?.id || ""}
      />
    </div>
  );
}
