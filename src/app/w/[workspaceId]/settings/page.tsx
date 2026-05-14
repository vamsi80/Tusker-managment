import { Suspense } from "react";
import { getWorkspaceTagsWithCount } from "@/data/tag/get-tags";
import { TagsManager } from "./_components/tag/tags-manager";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { AppLoader } from "@/components/shared/app-loader";

export const revalidate = 60; // 1 minute ISR revalidation

interface SettingsPageProps {
    params: Promise<{ workspaceId: string }>;
}

// ─── Streaming component ─────────────────────────────────────────────────────

async function SettingsContent({ workspaceId }: { workspaceId: string }) {
    const [tagsData, permissions] = await Promise.all([
        getWorkspaceTagsWithCount(workspaceId),
        getWorkspacePermissions(workspaceId),
    ]);

    const tags = tagsData.map((tag) => ({
        id: tag.id,
        name: tag.name,
        requirePurchase: tag.requirePurchase ?? false,
        _count: tag._count,
    }));

    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;

    return (
        <div className="space-y-2">
            <TagsManager
                workspaceId={workspaceId}
                tags={tags}
                isWorkspaceAdmin={isWorkspaceAdmin}
            />
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

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
