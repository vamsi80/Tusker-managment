import { redirect } from "next/navigation";

interface iAppProps {
  params: Promise<{ workspaceId: string; slug: string }>;
}

export default async function ProjectPage({ params }: iAppProps) {
  const { workspaceId, slug } = await params;
  redirect(`/w/${workspaceId}/p/${slug}/dashboard`);
}
