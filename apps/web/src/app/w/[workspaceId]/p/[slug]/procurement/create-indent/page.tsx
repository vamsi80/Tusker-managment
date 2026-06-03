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
  const [project] = await Promise.all([
    ProjectService.getProjectBySlug(workspaceId, slug),
    requireUser(),
  ]);

  if (!project) return null;

  // Fetch tasks with procurement tags AND existing indent taskIds in parallel
  const [allTasks, existingIndents] = await Promise.all([
    db.task.findMany({
      where: {
        projectId: project.id,
        isParent: false,
        tags: {
          some: {
            OR: [
              { requirePurchase: true },
              { name: { equals: "procurement", mode: "insensitive" } },
            ],
          },
        },
      },
      select: { id: true, name: true, taskSlug: true, dueDate: true },
      orderBy: { createdAt: "desc" },
    }),
    db.indent.findMany({
      where: { projectId: project.id, taskId: { not: null } },
      select: { taskId: true },
    }),
  ]);

  // Build a set of taskIds that already have an indent
  const claimedTaskIds = new Set(existingIndents.map((i) => i.taskId));

  // Exclude tasks that already have an indent (unless it's the prefilled one being edited)
  const tasks = allTasks.filter((t) => !claimedTaskIds.has(t.id));

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
