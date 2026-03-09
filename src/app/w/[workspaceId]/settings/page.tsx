import { Suspense } from "react";
import { getWorkspaceTagsWithCount } from "@/data/tag/get-tags";
import { TagsManager } from "./_components/tag/tags-manager";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { SettingsPageSkeleton } from "@/components/shared/workspace-skeletons";

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

// ─── Page ────────────────────────────────────────────────────────────────────

/**
 * Settings Page — skeleton shows instantly via loading.tsx.
 * Static heading renders immediately; content streams in via Suspense.
 */
export default async function SettingsPage({ params }: SettingsPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            {/* Static heading — no fetch needed */}
            <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your workspace preferences and configurations
                </p>
            </div>

            {/* Content streams in */}
            <Suspense fallback={<SettingsPageSkeleton />}>
                <SettingsContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
