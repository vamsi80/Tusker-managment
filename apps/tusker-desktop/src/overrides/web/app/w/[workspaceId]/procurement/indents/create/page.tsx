// Desktop copy of apps/web/src/app/w/[workspaceId]/procurement/indents/create/page.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { requireUser } from "@/lib/auth/require-user";
import { redirect } from "next/navigation";
import { CreateWorkspaceIndentClient } from "@/app/w/[workspaceId]/procurement/indents/create/_components/create-workspace-indent-client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { api } from "~/overrides/web/lib/desktop-api";

interface PageProps {
  params: Promise<{
    workspaceId: string;
  }>;
  searchParams: Promise<{
    projectId?: string;
  }>;
}

export default async function WorkspaceProcurementCreateIndent({ params, searchParams }: PageProps) {
  const { workspaceId } = await params;
  const { projectId: queryProjectId } = await searchParams;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  const member = { workspaceRole: (await getWorkspacePermissions(workspaceId, user.id, true)).workspaceRole };
  if (member?.workspaceRole === "ACCOUNTS") {
    redirect(`/w/${workspaceId}/procurement/indents`);
  }

  // Fetch active projects for this workspace to populate the selector
  const projects = await api<{ id: string; name: string; slug: string }[]>("/desktop/procurement/projects", { query: { workspaceId } });

  // If projectId is prefilled via search param, fetch the project's name
  let lockedProjectId: string | undefined = undefined;
  let lockedProjectName: string | undefined = undefined;
  if (queryProjectId) {
    const foundProject = projects.find((p) => p.id === queryProjectId);
    if (foundProject) {
      lockedProjectId = foundProject.id;
      lockedProjectName = foundProject.name;
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden h-full">
      {/* Back breadcrumb */}
      <div className="shrink-0 px-4 py-3 border-b border-border/50 bg-background flex items-center gap-2">
        <Link
          href={`/w/${workspaceId}/procurement/indents`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to Indents Registry
        </Link>
      </div>

      {/* Form wrapper */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CreateWorkspaceIndentClient
          workspaceId={workspaceId}
          projects={projects}
          lockedProjectId={lockedProjectId}
          lockedProjectName={lockedProjectName}
        />
      </div>
    </div>
  );
}
