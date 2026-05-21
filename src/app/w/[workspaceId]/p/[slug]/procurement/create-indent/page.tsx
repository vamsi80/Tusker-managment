import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ProjectService } from "@/server/services/project";
import { requireUser } from "@/lib/auth/require-user";
import { AppLoader } from "@/components/shared/app-loader";
import db from "@/lib/db";
import { CreateIndentPageClient } from "./_components/create-indent-page-client";

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
          <ArrowLeft className="h-3.5 w-3.5" />
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
  const [project] = await Promise.all([
    ProjectService.getProjectBySlug(workspaceId, slug),
    requireUser(),
  ]);

  if (!project) return null;

  const tasks = await db.task.findMany({
    where: { projectId: project.id },
    select: { id: true, name: true, taskSlug: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CreateIndentPageClient
      workspaceId={workspaceId}
      projectId={project.id}
      slug={slug}
      tasks={tasks}
      prefilledTaskId={taskId}
    />
  );
}
