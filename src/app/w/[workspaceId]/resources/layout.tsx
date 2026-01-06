import { Metadata } from "next";
import { MaterialNav } from "./_components/material-nav";

export const metadata: Metadata = {
    title: "Materials | Tusker",
    description: "Manage procurement and materials",
};

interface MaterialLayoutProps {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function MaterialLayout({ children, params }: MaterialLayoutProps) {
    const { workspaceId } = await params;

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Materials</h1>
                    <p className="text-muted-foreground text-sm">
                        Material flagged for purchase requirements
                    </p>
                </div>
                <MaterialNav workspaceId={workspaceId} />
            </div>

            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
