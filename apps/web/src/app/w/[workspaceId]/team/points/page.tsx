import { PointsBoard } from "./_components/points-board";

interface PointsPageProps {
    params: Promise<{ workspaceId: string }>;
}

export default async function PointsPage({ params }: PointsPageProps) {
    const { workspaceId } = await params;
    return <PointsBoard workspaceId={workspaceId} />;
}
