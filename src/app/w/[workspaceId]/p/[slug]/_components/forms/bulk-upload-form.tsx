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
import { useTaskContext } from "../../task/_components/shared/task-context";
import { ApiResponse } from "@/lib/types";
import { bulkUploadTasksAndSubtasks } from "@/actions/task/bulk-create-taskAndSubTask";

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
            Design Homepage,Create wireframe,Design wireframe mockup for homepage,john@example.com,2024-01-15,3,COMPLETED,DESIGN
            Design Homepage,Design components,Create reusable UI components,jane@example.com,2024-01-18,4,IN_PROGRESS,DESIGN
            Design Homepage,Review design,Final design review and approval,mike@example.com,2024-01-22,2,TO_DO,DESIGN
            Procurement,,,,,,,
            Procurement,Get quotes,Collect vendor quotes for materials,vendor@example.com,2024-01-20,2,TO_DO,PROCUREMENT
            Procurement,Compare prices,Analyze and compare vendor pricing,admin@example.com,2024-01-22,1,TO_DO,PROCUREMENT
            Project Kickoff,,,,,,,`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bulk_upload_template.csv';
        link.click();
        toast.success("Template downloaded successfully");
    };

    const downloadInstructions = () => {
        const instructionsContent = `BULK UPLOAD INSTRUCTIONS
========================

HOW TO USE THIS TEMPLATE:
-------------------------
1. Download the template CSV file (bulk_upload_template.csv)
2. Fill in your tasks and subtasks following the format below
3. Upload the completed CSV file

COLUMN DESCRIPTIONS:
-------------------

1. Task Name (REQUIRED)
   - Required for all rows
   - Group subtasks under the same task name
   - Example: "Design Homepage", "Procurement"

2. Subtask Name (CONDITIONAL)
   - Leave EMPTY for parent task rows
   - Fill in for subtask rows
   - Example: "Create wireframe", "Get quotes"

3. Description (OPTIONAL)
   - Optional description for subtasks
   - Can be left empty
   - Example: "Design wireframe mockup for homepage"

4. Assignee Email (OPTIONAL)
   - Email address of project member
   - Member must be added to the project first
   - Example: "john@example.com"

5. Start Date (OPTIONAL)
   - Format: YYYY-MM-DD
   - Example: "2024-01-15"

6. Days (OPTIONAL)
   - Number of days to complete the subtask
   - Must be an integer
   - Example: 3, 5, 10

7. Status (OPTIONAL)
   - Valid values:
     * TO_DO (default)
     * IN_PROGRESS
     * REVIEW
     * COMPLETED
     * BLOCKED
     * HOLD

8. Tag (OPTIONAL)
   - Valid values:
     * DESIGN
     * PROCUREMENT
     * CONTRACTOR

IMPORTANT RULES:
---------------
✓ Each parent task must have at least one row with only Task Name filled
✓ Subtasks must have both Task Name AND Subtask Name filled
✓ All subtasks with the same Task Name will be grouped under that parent task
✓ Assignee emails must match existing project members
✓ Dates must be in YYYY-MM-DD format
✓ Status and Tag values are case-sensitive

EXAMPLE STRUCTURE:
-----------------

Task Name          | Subtask Name      | Description                    | Assignee Email      | Start Date | Days | Status      | Tag
-------------------|-------------------|--------------------------------|---------------------|------------|------|-------------|-------------
Design Homepage    |                   |                                |                     |            |      |             |
Design Homepage    | Create wireframe  | Design wireframe mockup        | john@example.com    | 2024-01-15 | 3    | COMPLETED   | DESIGN
Design Homepage    | Design components | Create reusable UI components  | jane@example.com    | 2024-01-18 | 4    | IN_PROGRESS | DESIGN
Procurement        |                   |                                |                     |            |      |             |
Procurement        | Get quotes        | Collect vendor quotes          | vendor@example.com  | 2024-01-20 | 2    | TO_DO       | PROCUREMENT

TIPS:
-----
• Delete the example rows from the template before adding your data
• Use a spreadsheet program (Excel, Google Sheets) to edit the CSV
• Save as CSV format before uploading
• Test with a small batch first to ensure correct formatting

For support, contact your workspace administrator.
`;

        const blob = new Blob([instructionsContent], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bulk_upload_instructions.txt';
        link.click();
        toast.success("Instructions downloaded successfully");
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
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                        <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                            <div className="space-y-2 flex-1">
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                    Download the required files to get started:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={downloadTemplate}
                                        className="gap-2 bg-white dark:bg-gray-800"
                                    >
                                        <FileSpreadsheet className="h-4 w-4" />
                                        Template CSV
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={downloadInstructions}
                                        className="gap-2 bg-white dark:bg-gray-800"
                                    >
                                        <Download className="h-4 w-4" />
                                        Instructions
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* File Upload */}
                    <div className="space-y-3">
                        <Label htmlFor="file-upload">Upload CSV File</Label>
                        <input
                            ref={fileInputRef}
                            id="file-upload"
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileUpload}
                            disabled={pending}
                            className="hidden"
                        />
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer"
                        >
                            <div className="flex flex-col items-center justify-center gap-3">
                                <div className="p-3 rounded-full bg-primary/10">
                                    <Upload className="h-6 w-6 text-primary" />
                                </div>
                                {fileName ? (
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-foreground">
                                            {fileName}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Click to choose a different file
                                        </p>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-foreground">
                                            Click to upload or drag and drop
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            CSV, XLSX, or XLS files only
                                        </p>
                                    </div>
                                )}
                            </div>
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
