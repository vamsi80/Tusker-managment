import { requireUser } from "@/lib/auth/require-user";
import { getWorkspaceTasks } from "@/data/task/get-workspace-tasks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getStatusLabel } from "@/lib/colors/status-colors";
import { addDays, format, differenceInDays } from "date-fns";

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

/**
 * Workspace Gantt View
 * 
 * Shows all tasks from all projects in Gantt chart format
 * Uses the optimized getWorkspaceTasks function
 */
export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    const user = await requireUser();

    // Fetch all parent tasks from all projects
    const { tasks, totalCount } = await getWorkspaceTasks(workspaceId);

    // Filter tasks that have dates (required for Gantt)
    const tasksWithDates = tasks.filter(task => task.startDate && task.days);

    // Calculate date range for the timeline
    const allDates = tasksWithDates.map(t => new Date(t.startDate!));
    const minDate = allDates.length > 0
        ? new Date(Math.min(...allDates.map(d => d.getTime())))
        : new Date();
    const maxDate = tasksWithDates.length > 0
        ? new Date(Math.max(...tasksWithDates.map(t => {
            const start = new Date(t.startDate!);
            return addDays(start, t.days!).getTime();
        })))
        : addDays(new Date(), 30);

    const totalDays = differenceInDays(maxDate, minDate) || 30;

    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            {tasksWithDates.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6 border rounded-lg">
                    <div className="text-center space-y-2">
                        <h3 className="text-lg font-semibold">No Tasks with Dates</h3>
                        <p className="text-muted-foreground">
                            Tasks need start dates and duration to appear in Gantt view
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Found {totalCount} total tasks, but none have dates configured
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Timeline Header */}
                    <div className="p-4 border-b bg-muted/50">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold">Timeline View</h3>
                                <p className="text-sm text-muted-foreground">
                                    {format(minDate, 'MMM d, yyyy')} - {format(maxDate, 'MMM d, yyyy')}
                                </p>
                            </div>
                            <Badge variant="secondary">
                                {tasksWithDates.length} tasks
                            </Badge>
                        </div>
                    </div>

                    {/* Gantt Chart */}
                    <div className="flex-1 overflow-auto p-4">
                        <div className="space-y-3 min-w-[800px]">
                            {tasksWithDates.map((task) => {
                                const startDate = new Date(task.startDate!);
                                const endDate = addDays(startDate, task.days!);
                                const daysFromStart = differenceInDays(startDate, minDate);
                                const taskDuration = task.days!;

                                // Calculate position and width as percentages
                                const leftPercent = (daysFromStart / totalDays) * 100;
                                const widthPercent = (taskDuration / totalDays) * 100;

                                return (
                                    <Card key={task.id} className="p-4">
                                        <div className="space-y-2">
                                            {/* Task Info */}
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium truncate">{task.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant="outline" className="text-xs">
                                                            {task.project.name}
                                                        </Badge>
                                                        {task.status && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {getStatusLabel(task.status)}
                                                            </Badge>
                                                        )}
                                                        {task.tag && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {task.tag}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-muted-foreground text-right flex-shrink-0">
                                                    <div>{format(startDate, 'MMM d')}</div>
                                                    <div>→</div>
                                                    <div>{format(endDate, 'MMM d')}</div>
                                                    <div className="font-medium">{task.days}d</div>
                                                </div>
                                            </div>

                                            {/* Timeline Bar */}
                                            <div className="relative h-8 bg-muted rounded-md overflow-hidden">
                                                <div
                                                    className="absolute h-full bg-primary rounded-md flex items-center justify-center text-xs text-primary-foreground font-medium"
                                                    style={{
                                                        left: `${leftPercent}%`,
                                                        width: `${Math.max(widthPercent, 2)}%`
                                                    }}
                                                >
                                                    {widthPercent > 10 && task.name.substring(0, 20)}
                                                </div>
                                            </div>

                                            {/* Additional Info */}
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                {task.assignee?.workspaceMember?.user && (
                                                    <div className="flex items-center gap-1">
                                                        <span>👤</span>
                                                        <span>{task.assignee.workspaceMember.user.name}</span>
                                                    </div>
                                                )}
                                                {task._count.subTasks > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        <span>📋</span>
                                                        <span>{task._count.subTasks} subtasks</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="p-4 border-t bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                            Showing {tasksWithDates.length} of {totalCount} tasks with dates
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
