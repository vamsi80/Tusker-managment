import { getIndentRequests } from "@/data/procurement/get-indent-requests";
import { IndentClientPage } from "./_components/client";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function IndentPage({ params }: PageProps) {
    const { workspaceId } = await params;
    const { indentRequests } = await getIndentRequests(workspaceId);

    return <IndentClientPage data={indentRequests} />;
}
