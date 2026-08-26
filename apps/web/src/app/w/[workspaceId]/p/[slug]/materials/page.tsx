import { Suspense } from "react";
import { ProjectService } from "@/server/services/project";
import { AppLoader } from "@/components/shared/app-loader";
import { MaterialsClient } from "./_components/materials-client";

interface iAppProps {
    params: Promise<{ workspaceId: string; slug: string }>;
}

export default async function MaterialsPage({ params }: iAppProps) {
    const { workspaceId, slug } = await params;
    const loader = <AppLoader />;

    return (
        <div className="flex-1 flex flex-col min-h-0 py-4 overflow-hidden relative">
            <Suspense fallback={loader}>
                <ProjectMaterialsViewServer workspaceId={workspaceId} slug={slug} />
            </Suspense>
        </div>
    );
}

async function ProjectMaterialsViewServer({ workspaceId, slug }: { workspaceId: string, slug: string }) {
    const project = await ProjectService.getProjectBySlug(workspaceId, slug);
    if (!project) return null;
    return <MaterialsClient workspaceId={workspaceId} projectId={project.id} />;
}