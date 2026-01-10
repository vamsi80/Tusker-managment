import { getIndentRequests } from "@/data/procurement/get-indent-requests";
import { IconFileText, IconPackage } from "@tabler/icons-react";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function ProcurementDashboardPage({ params }: PageProps) {
    const { workspaceId } = await params;

    const { indentRequests } = await getIndentRequests(workspaceId);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                            <p className="text-2xl font-bold mt-1">{indentRequests.length}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <IconFileText className="h-6 w-6 text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Pending</p>
                            <p className="text-2xl font-bold mt-1">
                                {indentRequests.filter((i) => i.status === "REQUESTED").length}
                            </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                            <IconPackage className="h-6 w-6 text-yellow-600" />
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Under Review</p>
                            <p className="text-2xl font-bold mt-1">
                                {indentRequests.filter((i) => i.status === "UNDER_REVIEW").length}
                            </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                            <IconFileText className="h-6 w-6 text-orange-600" />
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Approved</p>
                            <p className="text-2xl font-bold mt-1">
                                {indentRequests.filter((i) => i.status === "APPROVED").length}
                            </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                            <IconPackage className="h-6 w-6 text-green-600" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}