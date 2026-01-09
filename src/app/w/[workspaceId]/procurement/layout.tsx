import { ProcurementNav } from "./_components/procurement-nav";

interface ProcurementLayoutProps {
    children: React.ReactNode;
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function ProcurementLayout({
    children,
    params,
}: ProcurementLayoutProps) {
    const { workspaceId } = await params;

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Procurement</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage material indent requests and procurement decisions
                    </p>
                </div>
            </div>

            <ProcurementNav workspaceId={workspaceId} />

            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
