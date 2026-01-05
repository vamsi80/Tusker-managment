import { getProcurementTasks } from "@/data/task/get-procurement-tasks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function ProcurementPage({ params }: PageProps) {
    const { workspaceId } = await params;
    const data = await getProcurementTasks(workspaceId);

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Procurement</h1>
                    <p className="text-muted-foreground text-sm">
                        Tasks flagged for purchase requirements
                    </p>
                </div>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Task Name</TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead>Indent Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.tasks.map((task: any) => (
                            <TableRow key={task.id}>
                                <TableCell className="font-medium">{task.name}</TableCell>
                                <TableCell>{task.project?.name || "N/A"}</TableCell>
                                <TableCell>
                                    <Badge variant="outline">
                                        {task.status?.replace("_", " ") || "UNKNOWN"}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                        {data.tasks.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                    No procurement tasks found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
