interface WorkspaceKanbanViewProps {
    workspaceId: string;
}

/**
 * Workspace Kanban View
 * 
 * Shows all tasks from all projects in Kanban format
 * TODO: Implement full Kanban board for workspace-level tasks
 */
export async function WorkspaceKanbanView({ workspaceId }: WorkspaceKanbanViewProps) {

    return (
        <div className="flex-1 p-6 border rounded-lg">
            <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Kanban View</h3>
                <p className="text-muted-foreground">
                    Workspace-level Kanban view coming soon!
                </p>
                <p className="text-sm text-muted-foreground">
                    Found tasks across all projects
                </p>
            </div>
        </div>
    );
}
