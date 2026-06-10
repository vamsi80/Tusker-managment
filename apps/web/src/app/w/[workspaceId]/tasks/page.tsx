import { redirect } from "next/navigation";

interface Props {
    params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceTasksPage({ params }: Props) {
    const { workspaceId } = await params;
    redirect(`/w/${workspaceId}/tasks/list`);
}
