"use client";

import { useRouter } from "next/navigation";
import { CreateIndentForm } from "./create-indent-form";

interface CreateIndentPageClientProps {
  workspaceId: string;
  projectId: string;
  projectName?: string;
  lockedProject?: boolean;
  slug: string;
  tasks: { id: string; name: string; taskSlug: string; dueDate?: Date | null }[];
  prefilledTaskId?: string;
}

export function CreateIndentPageClient({
  workspaceId,
  projectId,
  projectName,
  lockedProject,
  slug,
  tasks,
  prefilledTaskId,
}: CreateIndentPageClientProps) {
  const router = useRouter();

  return (
    <div className="h-full">
      <CreateIndentForm
        projectId={projectId}
        projectName={projectName}
        lockedProject={lockedProject}
        workspaceId={workspaceId}
        taskId={prefilledTaskId}
        tasks={tasks}
        onSuccess={() => {
          router.push(`/w/${workspaceId}/p/${slug}/procurement`);
          router.refresh();
        }}
        onCancel={() => {
          router.push(`/w/${workspaceId}/p/${slug}/procurement`);
        }}
      />
    </div>
  );
}
