import { redirect } from "next/navigation";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function MaterialPage({ params }: PageProps) {
    const { workspaceId } = await params;
    redirect(`/w/${workspaceId}/resources/vendors`);
}
