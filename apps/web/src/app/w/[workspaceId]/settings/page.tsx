import { Suspense } from "react";
import { TagsManager } from "./_components/tag/tags-manager";
import { AppLoader } from "@/components/shared/app-loader";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

export const revalidate = 60;

interface SettingsPageProps {
    params: Promise<{ workspaceId: string }>;
}

type TagWithCount = {
    id: string;
    name: string;
    workspaceId: string;
    requirePurchase: boolean;
    _count: { tasks: number };
};

async function SettingsContent({ workspaceId }: { workspaceId: string }) {
    const [tagsResponse, { data: permissions }] = await Promise.all([
        serverApiFetch<{ success: boolean; tags: TagWithCount[] }>(
            `/workspace-tags?workspaceId=${workspaceId}&withCount=true`
        ).catch(() => ({ success: false, tags: [] as TagWithCount[] })),
        serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean } }>(
            `/workspaces/${workspaceId}/permissions`
        ).catch(() => ({ data: { isWorkspaceAdmin: false } })),
    ]);

    const tags = (tagsResponse.tags ?? []).map((tag: TagWithCount) => ({
        id: tag.id,
        name: tag.name,
        requirePurchase: tag.requirePurchase ?? false,
        _count: tag._count,
    }));

    return (
        <div className="space-y-2">
            <TagsManager
                workspaceId={workspaceId}
                tags={tags}
                isWorkspaceAdmin={permissions.isWorkspaceAdmin}
            />
        </div>
    );
}

export default async function SettingsPage({ params }: SettingsPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <Suspense fallback={<AppLoader />}>
                <SettingsContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
