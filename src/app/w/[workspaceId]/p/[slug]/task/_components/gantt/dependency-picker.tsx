"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link2, X, Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { GanttSubtask, GanttTask } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { addSubtaskDependency, removeSubtaskDependency } from "./actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DependencyPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subtask: GanttSubtask;
    allTasks: GanttTask[];
    workspaceId: string;
    projectId: string;
}

export function DependencyPicker({
    open,
    onOpenChange,
    subtask,
    allTasks,
    workspaceId,
    projectId,
}: DependencyPickerProps) {
    const [isPending, startTransition] = useTransition();
    const [selectedDependencies, setSelectedDependencies] = useState<Set<string>>(
        new Set(subtask.dependsOnIds || [])
    );

    // Get all available subtasks (excluding the current one)
    const availableSubtasks = allTasks.flatMap(task =>
        task.subtasks.filter(st => st.id !== subtask.id)
    );

    const handleToggleDependency = (dependencyId: string) => {
        const newSelected = new Set(selectedDependencies);
        if (newSelected.has(dependencyId)) {
            newSelected.delete(dependencyId);
        } else {
            newSelected.add(dependencyId);
        }
        setSelectedDependencies(newSelected);
    };

    const handleSave = () => {
        const currentDeps = new Set(subtask.dependsOnIds || []);
        const toAdd = [...selectedDependencies].filter(id => !currentDeps.has(id));
        const toRemove = [...currentDeps].filter(id => !selectedDependencies.has(id));

        if (toAdd.length === 0 && toRemove.length === 0) {
            onOpenChange(false);
            return;
        }

        startTransition(async () => {
            let hasError = false;

            // Add new dependencies
            for (const depId of toAdd) {
                const result = await addSubtaskDependency(
                    subtask.id,
                    depId,
                    projectId,
                    workspaceId
                );
                if (!result.success) {
                    toast.error(result.message);
                    hasError = true;
                }
            }

            // Remove old dependencies
            for (const depId of toRemove) {
                const result = await removeSubtaskDependency(
                    subtask.id,
                    depId,
                    projectId,
                    workspaceId
                );
                if (!result.success) {
                    toast.error(result.message);
                    hasError = true;
                }
            }

            if (!hasError) {
                toast.success("Dependencies updated successfully");
                onOpenChange(false);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Link2 className="h-5 w-5" />
                        Manage Dependencies for "{subtask.name}"
                    </DialogTitle>
                    <DialogDescription>
                        Select which tasks must be completed before this task can start.
                        Dependencies help visualize task relationships in the Gantt chart.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Current Dependencies */}
                    {subtask.dependsOnIds && subtask.dependsOnIds.length > 0 && (
                        <div className="rounded-lg border p-3 bg-muted/50">
                            <p className="text-sm font-medium mb-2">Current Dependencies:</p>
                            <div className="flex flex-wrap gap-2">
                                {subtask.dependsOnIds.map(depId => {
                                    const dep = availableSubtasks.find(st => st.id === depId);
                                    return dep ? (
                                        <div
                                            key={depId}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs"
                                        >
                                            <Link2 className="h-3 w-3" />
                                            {dep.name}
                                        </div>
                                    ) : null;
                                })}
                            </div>
                        </div>
                    )}

                    {/* Available Subtasks */}
                    <div>
                        <p className="text-sm font-medium mb-2">Available Tasks:</p>
                        <ScrollArea className="h-[400px] rounded-md border">
                            <div className="p-4 space-y-2">
                                {allTasks.map(task => (
                                    <div key={task.id} className="space-y-1">
                                        <p className="text-sm font-semibold text-muted-foreground px-2">
                                            {task.name}
                                        </p>
                                        {task.subtasks
                                            .filter(st => st.id !== subtask.id)
                                            .map(st => {
                                                const isSelected = selectedDependencies.has(st.id);
                                                return (
                                                    <button
                                                        key={st.id}
                                                        onClick={() => handleToggleDependency(st.id)}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                                                            "hover:bg-muted",
                                                            isSelected && "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                                                                isSelected
                                                                    ? "bg-blue-600 border-blue-600"
                                                                    : "border-muted-foreground/30"
                                                            )}
                                                        >
                                                            {isSelected && (
                                                                <Check className="h-3 w-3 text-white" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-sm font-medium">{st.name}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {st.start} → {st.end}
                                                            </p>
                                                        </div>
                                                        {st.status === "COMPLETED" && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                                                Completed
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isPending}
                        >
                            {isPending ? "Saving..." : "Save Dependencies"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
