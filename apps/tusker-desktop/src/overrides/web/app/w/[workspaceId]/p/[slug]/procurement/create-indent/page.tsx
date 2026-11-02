// Desktop copy of apps/web/src/app/w/[workspaceId]/p/[slug]/procurement/create-indent/page.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ProjectService } from "@tusker/core/server/services/project/index";
import { requireUser } from "@/lib/auth/require-user";
import { AppLoader } from "@/components/shared/app-loader";
import { CreateIndentPageClient } from "@/app/w/[workspaceId]/p/[slug]/procurement/create-indent/_components/create-indent-page-client";
import { redirect } from "next/navigation";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { api } from "~/overrides/web/lib/desktop-api";

interface iAppProps {
  params: Promise<{ workspaceId: string; slug: string }>;
  searchParams: Promise<{ taskId?: string }>;
}

export default async function CreateIndentPage({ params, searchParams }: iAppProps) {
  const { workspaceId, slug } = await params;
  const { taskId } = await searchParams;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden h-full">
      {/* Back breadcrumb */}
      <div className="shrink-0 px-4 py-3 border-b border-border/50 bg-background flex items-center gap-2">
        <Link
          href={`/w/${workspaceId}/p/${slug}/procurement`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to Procurement
        </Link>
      </div>

      {/* Form — no extra padding, fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<AppLoader />}>
          <CreateIndentServer workspaceId={workspaceId} slug={slug} taskId={taskId} />
        </Suspense>
      </div>
    </div>
  );
}

async function CreateIndentServer({
  workspaceId,
  slug,
  taskId,
}: {
  workspaceId: string;
  slug: string;
  taskId?: string;
}) {
  const [project, user] = await Promise.all([
    ProjectService.getProjectBySlug(workspaceId, slug),
    requireUser(),
  ]);

  if (!project) return null;
  const member = { workspaceRole: (await getWorkspacePermissions(workspaceId, user.id, true)).workspaceRole };
  if (member?.workspaceRole === "ACCOUNTS") {
    redirect(`/w/${workspaceId}/p/${slug}/procurement`);
  }

  // Procurement-tagged tasks that don't have an indent yet (same query and filter, on the API)
  const tasks = await api<any[]>("/desktop/procurement/indent-tasks", { query: { workspaceId, projectId: project.id } });

  return (
    <CreateIndentPageClient
      workspaceId={workspaceId}
      projectId={project.id}
      projectName={project.name}
      lockedProject={true}
      slug={slug}
      tasks={tasks}
      prefilledTaskId={taskId}
    />
  );
}
