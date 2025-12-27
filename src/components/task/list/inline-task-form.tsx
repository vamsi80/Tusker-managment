"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Check, Loader2 } from "lucide-react";
import { createTask } from "@/actions/task/create-task";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import slugify from "slugify";
import { TableCell, TableRow } from "@/components/ui/table";

interface InlineTaskFormProps {
    workspaceId: string;
    projectId: string;
    onCancel: () => void;
    onTaskCreated?: (task: any) => void;
}

/**
 * Inline task creation form that appears as a table row
 * Similar to ClickUp's inline editing experience
 */
export function InlineTaskForm({
    workspaceId,
    projectId,
    onCancel,
    onTaskCreated,
}: InlineTaskFormProps) {
    const [pending, startTransition] = useTransition();
    const [taskName, setTaskName] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!taskName.trim()) {
            toast.error("Task name is required");
            return;
        }

        if (taskName.trim().length < 3) {
            toast.error("Task name must be at least 3 characters long");
            return;
        }

        // Auto-generate slug from task name
        const taskSlug = slugify(taskName.trim(), { lower: true, strict: true });

        if (taskSlug.length < 3) {
            toast.error("Task name must generate a valid slug (at least 3 characters)");
            return;
        }

        startTransition(async () => {
            const { data: result, error } = await tryCatch(
                createTask({
                    name: taskName.trim(),
                    taskSlug: taskSlug,
                    projectId,
                })
            );

            if (error) {
                toast.error(error.message || "Failed to create task");
                return;
            }

            if (result.status === "success") {
                toast.success(result.message || "Task created successfully");
                setTaskName("");
                onTaskCreated?.(result.data);
                onCancel();
            } else {
                toast.error(result.message || "Failed to create task");
            }
        });
    };

    return (
        <TableRow className="bg-muted/20 hover:bg-muted/30">
            <TableCell className="w-[50px]"></TableCell>

            {/* Task Name Input */}
            <TableCell className="min-w-[250px]">
                <Input
                    placeholder="Task name..."
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                        if (e.key === "Escape") {
                            onCancel();
                        }
                    }}
                    autoFocus
                    disabled={pending}
                    className="h-8 border-primary/50 focus-visible:ring-primary"
                />
            </TableCell>

            {/* Description - Empty for now */}
            <TableCell className="w-[200px]">
                <Input
                    placeholder="Description (optional)..."
                    disabled={pending}
                    className="h-8 text-muted-foreground"
                />
            </TableCell>

            {/* Other columns - Empty placeholders */}
            <TableCell className="w-[200px]"></TableCell>
            <TableCell className="w-[120px]"></TableCell>
            <TableCell className="w-[150px]"></TableCell>
            <TableCell className="w-[150px]"></TableCell>
            <TableCell className="w-[120px]"></TableCell>
            <TableCell className="w-[150px]"></TableCell>

            {/* Action Buttons */}
            <TableCell className="w-[50px]">
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 hover:bg-green-100 hover:text-green-600"
                        onClick={handleSubmit}
                        disabled={pending || taskName.trim().length < 3}
                    >
                        {pending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}
