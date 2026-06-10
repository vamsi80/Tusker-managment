import { cache } from "react";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

type ProjectMetadata = { id: string; name: string; color: string; userRole: string; canPerformBulkOperations: boolean } | null;

export const getProjectMetadata = cache(async (slug: string, workspaceId: string): Promise<ProjectMetadata> =>
    serverApiFetch<{ success: boolean; data: ProjectMetadata }>(
        `/projects/slug/${slug}/metadata?workspaceId=${workspaceId}`
    ).then(r => r.data).catch(() => null)
);
