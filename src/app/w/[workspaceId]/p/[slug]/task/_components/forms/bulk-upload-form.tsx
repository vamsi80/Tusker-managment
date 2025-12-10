"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2, Upload, Download, FileSpreadsheet, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { bulkUploadTasksAndSubtasks } from "../../action";
import { useTaskContext } from "../shared/task-context";
import { ApiResponse } from "@/lib/types";

interface BulkUploadFormProps {
    projectId: string;
}

interface ParsedTask {
    taskName: string;
    subtaskName?: string;
    description?: string;
    assigneeEmail?: string;
    startDate?: string;
    days?: number;
    status?: string;
    tag?: string;
}

export const BulkUploadForm = ({ projectId }: BulkUploadFormProps) => {
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const { setIsAddingTask } = useTaskContext();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [parsedData, setParsedData] = useState<ParsedTask[]>([]);
    const [fileName, setFileName] = useState<string>("");

    const downloadTemplate = () => {
        const csvContent = `Task Name,Subtask Name,Description,Assignee Email,Start Date,Days,Status,Tag
                            Design Homepage,,,,,,,
                            Design Homepage,Create wireframe,Design wireframe mockup,john@example.com,2024-01-15,3,COMPLETED,DESIGN
                            Design Homepage,Design components,Create UI components,jane@example.com,2024-01-18,4,IN_PROGRESS,DESIGN
                            Procurement,,,,,,,
                            Procurement,Get quotes,Collect vendor quotes,mike@example.com,2024-01-20,2,TO_DO,PROCUREMENT`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bulk_upload_template.csv';
        link.click();
        toast.success("Template downloaded successfully");
    };

    const parseCSV = (text: string): ParsedTask[] => {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error("CSV file is empty or invalid");
        }

        const dataLines = lines.slice(1);
        const tasks: ParsedTask[] = [];

        for (const line of dataLines) {
            const values = line.split(',').map(v => v.trim());

            if (values.length < 8) continue;

            const [taskName, subtaskName, description, assigneeEmail, startDate, days, status, tag] = values;

            if (!taskName) continue;

            tasks.push({
                taskName,
                subtaskName: subtaskName || undefined,
                description: description || undefined,
                assigneeEmail: assigneeEmail || undefined,
                startDate: startDate || undefined,
                days: days ? parseInt(days) : undefined,
                status: status || undefined,
                tag: tag || undefined,
            });
        }

        return tasks;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);

        try {
            const text = await file.text();
            const parsed = parseCSV(text);

            if (parsed.length === 0) {
                toast.error("No valid data found in file");
                return;
            }

            setParsedData(parsed);
            toast.success(`Parsed ${parsed.length} rows successfully`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to parse file");
            setParsedData([]);
            setFileName("");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (parsedData.length === 0) {
            toast.error("Please upload a file first");
            return;
        }

        startTransition(async () => {
            setIsAddingTask(true);
            const { data: result, error } = await tryCatch<ApiResponse>(
                bulkUploadTasksAndSubtasks({
                    projectId,
                    tasks: parsedData,
                })
            );

            if (error) {
                toast.error(error.message);
                console.error(error);
                setIsAddingTask(false);
                return;
            }

            if (result && result.status === "success") {
                toast.success(result.message || "Tasks uploaded successfully");
                triggerConfetti();

                setParsedData([]);
                setFileName("");
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
                setOpen(false);

                router.refresh();
            } else {
                toast.error(result.message);
                setIsAddingTask(false);
            }
        });
    };

    const taskCount = parsedData.filter(t => !t.subtaskName).length;
    const subtaskCount = parsedData.filter(t => t.subtaskName).length;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Bulk Upload
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Bulk Upload Tasks & Subtasks</DialogTitle>
                    <DialogDescription>
                        Upload an Excel/CSV file with tasks and subtasks
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="text-sm text-muted-foreground">
                        Check the format of the template{' '}
                        <button
                            type="button"
                            onClick={downloadTemplate}
                            className="text-primary underline hover:text-primary/80 font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                            Download template
                        </button>
                        {' '}to get start uploading.
                    </div>

                    {/* File Upload */}
                    <div className="space-y-2">
                        <Label htmlFor="file-upload">Upload CSV File</Label>
                        <div className="flex items-center gap-3">
                            <input
                                ref={fileInputRef}
                                id="file-upload"
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                onChange={handleFileUpload}
                                disabled={pending}
                                className="hidden"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={pending}
                                className="gap-2"
                            >
                                <Upload className="h-4 w-4" />
                                Choose File
                            </Button>
                            {fileName && (
                                <span className="text-sm text-muted-foreground">
                                    {fileName}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Preview */}
                    {parsedData.length > 0 && (
                        <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                            <div className="space-y-1">
                                <p className="font-semibold text-sm">Preview:</p>
                                <p className="text-sm">
                                    • {taskCount} task{taskCount !== 1 ? 's' : ''}
                                </p>
                                <p className="text-sm">
                                    • {subtaskCount} subtask{subtaskCount !== 1 ? 's' : ''}
                                </p>
                                <p className="text-sm text-muted-foreground mt-2">
                                    Total: {parsedData.length} rows
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending || parsedData.length === 0}>
                            {pending ? (
                                <>
                                    Uploading...
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                </>
                            ) : (
                                <>
                                    Upload {parsedData.length} Items
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
