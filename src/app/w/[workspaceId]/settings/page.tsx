import { getWorkspaceTagsWithCount } from "@/data/tag/get-tags";
import { TagsManager } from "./_components/tag/tags-manager";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

interface SettingsPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
    const { workspaceId } = await params;

    const [tagsData, permissions] = await Promise.all([
        getWorkspaceTagsWithCount(workspaceId),
        getWorkspacePermissions(workspaceId)
    ]);

    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
        requirePurchase: tag.requirePurchase ?? false,
        _count: tag._count,
    }));

    return (
        <div className="w-full">
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your workspace preferences and configurations
                </p>
            </div>

            <div className="space-y-2">
                <TagsManager
                    workspaceId={workspaceId}
                    tags={tags}
                    isWorkspaceAdmin={permissions.isWorkspaceAdmin}
                />
            </div>
        </div>
    );
}
