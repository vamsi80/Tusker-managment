"use client";

import { useRouter } from "next/navigation";
import { CreateIndentForm } from "@/app/w/[workspaceId]/p/[slug]/procurement/create-indent/_components/create-indent-form";

interface ProjectItem {
  id: string;
  name: string;
  slug: string;
}

interface CreateWorkspaceIndentClientProps {
  workspaceId: string;
  projects: ProjectItem[];
  lockedProjectId?: string;
  lockedProjectName?: string;
}

export function CreateWorkspaceIndentClient({
  workspaceId,
  projects,
  lockedProjectId,
  lockedProjectName,
}: CreateWorkspaceIndentClientProps) {
  const router = useRouter();

  return (
    <div className="h-full">
      <CreateIndentForm
        workspaceId={workspaceId}
        projects={projects}
        projectId={lockedProjectId}
        projectName={lockedProjectName}
        lockedProject={!!lockedProjectId}
        onSuccess={() => {
          router.push(`/w/${workspaceId}/procurement/indents`);
          router.refresh();
        }}
        onCancel={() => {
          router.push(`/w/${workspaceId}/procurement/indents`);
        }}
      />
    </div>
  );
}
