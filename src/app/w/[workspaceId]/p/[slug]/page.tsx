import { redirect } from "next/navigation";

interface ProjectPageProps {
  params: { workspaceId: string; slug: string };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { workspaceId, slug } = await params;
  redirect(`/w/${workspaceId}/p/${slug}/dashboard`);
}
