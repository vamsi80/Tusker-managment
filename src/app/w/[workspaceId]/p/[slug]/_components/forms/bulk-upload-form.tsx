"use client";

import { useState, useTransition, useCallback } from "react";
import { Loader2, Download, FileSpreadsheet, Upload, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTaskContext } from "@/app/w/[workspaceId]/_components/shared/task-context";
import { ApiResponse } from "@/lib/types";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { useDropzone, FileRejection } from "react-dropzone";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { useProjectLayout } from "../project-layout-context";

import { useEffect } from "react";
import { format } from "date-fns";
import { APP_DATE_FORMAT } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";


interface BulkUploadFormProps {
    projectId: string;
}

interface ParsedTask {
    taskName: string;
    subtaskName?: string;
    description?: string;
    assigneeEmail?: string;
    reviewerEmail?: string;
    startDate?: string;
    days?: number;
    status?: string;
    tags?: string[];
}

export const BulkUploadForm = ({ projectId }: BulkUploadFormProps) => {
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const { setIsAddingTask } = useTaskContext();
    const { projectMembers, workspaceId, workspaceTags, revalidate } = useProjectLayout();
    const [fileName, setFileName] = useState<string>("");
    const [selectedReviewerId, setSelectedReviewerId] = useState<string>("");
    const [view, setView] = useState<"upload" | "preview">("upload");
    const [isProcessing, setIsProcessing] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedTask[]>([]);
    const [progress, setProgress] = useState(0);


    useEffect(() => {
        if (open) {
            revalidate();
        }
    }, [open, revalidate]);


    const downloadTemplate = async () => {
        const ExcelJS = await import("exceljs");
        const workbook = new ExcelJS.Workbook();

        // 1. Create main template sheet
        const worksheet = workbook.addWorksheet("Tasks Template");

        // Define columns first (this also sets headers)
        worksheet.columns = [
            { header: 'Task Name', key: 'taskName', width: 25 },
            { header: 'Subtask Name', key: 'subtaskName', width: 25 },
            { header: 'Description', key: 'description', width: 30 },
            { header: 'Assignee Email', key: 'assigneeEmail', width: 30 },
            { header: 'Reviewer Email', key: 'reviewerEmail', width: 30 },
            { header: 'Start Date', key: 'startDate', width: 20, style: { numFmt: 'd mmm yyyy' } },
            { header: 'Days', key: 'days', width: 10 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Tag 1', key: 'tag1', width: 15 },
            { header: 'Tag 2', key: 'tag2', width: 15 },
            { header: 'Tag 3', key: 'tag3', width: 15 },
            { header: 'Tag 4', key: 'tag4', width: 15 }
        ];

        // Style the header row (Row 1)
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF3F4F6' }
            };
            cell.alignment = { horizontal: 'center' };
        });

        // Add Example Rows matching the instructions
        const exampleRows = [
            ["Design Homepage", "", "", "", "", "", "", "", "", ""],
            ["Design Homepage", "Create wireframe", "Design wireframe mockup", "john@example.com", "admin@example.com", "15 Apr 2026", 3, "COMPLETED", "DESIGN", ""],
            ["Design Homepage", "Design components", "Create reusable UI components", "jane@example.com", "", "18 Apr 2026", 4, "IN_PROGRESS", "DESIGN", ""],
            ["Procurement", "", "", "", "", "", "", "", "", ""],
            ["Procurement", "Get quotes", "Collect vendor quotes", "vendor@example.com", "admin@example.com", "20 Apr 2026", 2, "TO_DO", "PROCUREMENT", "URGENT", "TAG-3", "TAG-4"]
        ];
        worksheet.addRows(exampleRows);

        // 2. Create Reference Data sheet (can be hidden)
        const refSheet = workbook.addWorksheet("DataLists");

        // Add valid statuses
        const statuses = ["TO_DO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED", "HOLD"];
        refSheet.getColumn(1).values = ["Status", ...statuses];

        // Add valid tags
        const tagNames = workspaceTags.length > 0 ? workspaceTags.map(t => t.name) : ["DESIGN", "PROCUREMENT", "CONTRACTOR"];
        refSheet.getColumn(2).values = ["Tags", ...tagNames];

        // Add valid members
        const memberEmails = projectMembers.length > 0
            ? projectMembers.map(m => m.user.surname ? `${m.user.email} (${m.user.surname})` : m.user.email)
            : ["john@example.com (John)", "mike@example.com (Mike)"];
        refSheet.getColumn(3).values = ["Emails", ...memberEmails];

        // Add reviewer candidates (Owner/Admin/Lead/PM)
        const reviewerEmails = projectMembers.length > 0
            ? projectMembers
                .filter((m: any) => m.projectRole && ["OWNER", "ADMIN", "LEAD", "PROJECT_MANAGER"].includes(m.projectRole))
                .map((m: any) => {
                    const role = m.projectRole ? ` [${m.projectRole.replace('_', ' ')}]` : "";
                    return m.user.surname ? `${m.user.email} (${m.user.surname}${role})` : `${m.user.email}${role}`;
                })
            : memberEmails;
        refSheet.getColumn(4).values = ["Reviewers", ...reviewerEmails];


        // 3. Define Names for ranges (for validation)
        const statusRange = `DataLists!$A$2:$A$${statuses.length + 1}`;
        const tagRange = `DataLists!$B$2:$B$${tagNames.length + 1}`;
        const emailRange = `DataLists!$C$2:$C$${memberEmails.length + 1}`;
        const reviewerRange = `DataLists!$D$2:$D$${reviewerEmails.length + 1}`;

        // 4. Apply Data Validation to 100 rows in main sheet
        for (let i = 2; i <= 106; i++) {
            // Assignee Email (Column 4)
            worksheet.getCell(`D${i}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [emailRange],
                showErrorMessage: true,
                errorTitle: 'Invalid Selection',
                error: 'Please select an email from the list.'
            };

            // Reviewer Email (Column 5)
            worksheet.getCell(`E${i}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [reviewerRange],
                showErrorMessage: true,
                errorTitle: 'Invalid Selection',
                error: 'Please select an email from the list.'
            };

            // Start Date (Column 6 / F)
            worksheet.getCell(`F${i}`).dataValidation = {
                type: 'date',
                allowBlank: true,
                operator: 'greaterThan',
                formulae: [new Date(2020, 0, 1)], // Any date after 2020
                showErrorMessage: true,
                errorTitle: 'Invalid Date',
                error: 'Please enter a valid date in format: 15 Apr 2026',
                prompt: 'Enter date (e.g., 15 Apr 2026)',
                showInputMessage: true
            };
            // Status (Column 8)
            worksheet.getCell(`H${i}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [statusRange],
                showErrorMessage: true,
                errorTitle: 'Invalid Status',
                error: 'Please select a valid task status.'
            };

            // Tag 1 (Column 9)
            worksheet.getCell(`I${i}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [tagRange],
                showErrorMessage: true,
                errorTitle: 'Invalid Tag',
                error: 'Please select a valid project tag.'
            };

            // Tag 2 (Column 10)
            worksheet.getCell(`J${i}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [tagRange],
                showErrorMessage: true,
                errorTitle: 'Invalid Tag',
                error: 'Please select a valid project tag.'
            };

            // Start Date (Column 6)
            const dateCell = worksheet.getCell(`F${i}`);
            dateCell.numFmt = 'd mmm yyyy';
            dateCell.dataValidation = {
                type: 'date',
                operator: 'between',
                formulae: [new Date(2000, 0, 1), new Date(2100, 11, 31)],
                allowBlank: true,
                showInputMessage: true,
                promptTitle: 'Select Start Date',
                prompt: 'Please enter a date (e.g., 15 Apr 2026). Excel will provide a calendar if supported.',
                showErrorMessage: true,
                errorTitle: 'Invalid Date',
                error: 'Please enter a valid date in the format: 15 Apr 2026.'
            };

            // Tag 3 (Column 11)
            worksheet.getCell(`K${i}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [tagRange],
                showErrorMessage: true,
                errorTitle: 'Invalid Tag',
                error: 'Please select a valid project tag.'
            };

            // Tag 4 (Column 12)
            worksheet.getCell(`L${i}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [tagRange],
                showErrorMessage: true,
                errorTitle: 'Invalid Tag',
                error: 'Please select a valid project tag.'
            };
        }

        // Add a note/comment to the Start Date header for "Calendar" feel
        const startDateCell = worksheet.getCell('F1');
        startDateCell.note = {
            texts: [
                { font: { bold: true, size: 10, color: { argb: 'FF000000' } }, text: 'DATE PICKER\n' },
                { font: { size: 9 }, text: 'Excel will show a date picker here. Please use d MMM yyyy format (e.g., 15 Apr 2026).' }
            ]
        };

        // Hide the reference sheet
        refSheet.state = 'hidden';

        // Write to buffer and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `bulk_upload_template_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();

        toast.success("Excel template with dropdowns downloaded successfully");
    };

    const downloadInstructions = () => {
        const tagList = workspaceTags.length > 0 ? workspaceTags.map((t: any) => `                * ${t.name}`).join('\n') : "                * DESIGN\n                * PROCUREMENT\n                * CONTRACTOR";
        const memberList = projectMembers.length > 0 ? projectMembers.map((m: any) => `                * ${m.user.email} (${m.user.surname})`).join('\n') : "                * (No members found in project)";


        const instructionsContent = `BULK UPLOAD INSTRUCTIONS
            ========================

            HOW TO USE THIS TEMPLATE:
            -------------------------
            1. Download the Excel template file (bulk_upload_template.xlsx)
            2. Fill in your tasks and subtasks following the format below
            3. Upload the completed Excel file (or save as CSV if preferred)

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
            - Valid emails for this project:
${memberList}

            5. Reviewer Email (OPTIONAL)
            - Email address of reviewer (must be Owner/Admin/PM/Lead)
            - If left empty, defaults to task creator

            6. Start Date (OPTIONAL)
            - Format: d MMM yyyy (e.g., 15 Apr 2026)
            - Example: "15 Apr 2026"

            7. Days (OPTIONAL)
            - Number of days to complete the subtask
            - Must be an integer
            - Example: 3, 5, 10

            8. Status (OPTIONAL)
            - Valid values:
                * TO_DO (default)
                * IN_PROGRESS
                * REVIEW
                * COMPLETED
                * CANCELLED
                * HOLD

            9. Tag (OPTIONAL)
            - Valid values for this project:
${tagList}

            IMPORTANT RULES:
            ---------------
            ✓ Each parent task must have at least one row with only Task Name filled
            ✓ Subtasks must have both Task Name AND Subtask Name filled
            ✓ All subtasks with the same Task Name will be grouped under that parent task
            ✓ Assignee emails must match existing project members
            ✓ Dates must be in '15 Apr 2026' format
            ✓ Status and Tag values are case-sensitive

            EXAMPLE STRUCTURE:
            -----------------

            Task Name          | Subtask Name      | Description                    | Assignee Email      | Reviewer Email      | Start Date | Days | Status      | Tag
            -------------------|-------------------|--------------------------------|---------------------|---------------------|------------|------|-------------|-------------
            Design Homepage    |                   |                                |                     |                     |            |      |             |
            Design Homepage    | Create wireframe  | Design wireframe mockup        | john@example.com    | admin@example.com   | 15 Apr 2026 | 3    | COMPLETED   | DESIGN
            Design Homepage    | Design components | Create reusable UI components  | jane@example.com    |                     | 18 Apr 2026 | 4    | IN_PROGRESS | DESIGN
            Procurement        |                   |                                |                     |                     |            |      |             |
            Procurement        | Get quotes        | Collect vendor quotes          | vendor@example.com  | admin@example.com   | 20 Apr 2026 | 2    | TO_DO       | PROCUREMENT

            TIPS:
            -----
            • Delete the example rows from the template before adding your data
            • Use a spreadsheet program (Excel, Google Sheets) to edit the file
            • Upload the XLSX file or save as CSV format before uploading
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


    // Helper function to sanitize strings and remove null bytes
    const sanitizeString = (str: string): string => {
        if (!str) return str;
        // Remove null bytes (0x00) and other control characters except newlines and tabs
        return str.replace(/\x00/g, '').replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim();
    };

    const parseCSVLine = (line: string): string[] => {
        const result = [];
        let curValue = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"' && inQuotes && nextChar === '"') {
                // Handle escaped quotes ("")
                curValue += '"';
                i++;
            } else if (char === '"') {
                // Toggle quote mode
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                // Value separator
                result.push(curValue);
                curValue = "";
            } else {
                curValue += char;
            }
        }
        result.push(curValue);
        return result.map(v => sanitizeString(v));
    };

    const mapValuesToTask = (values: string[]): ParsedTask => {
        // Pad the values array to ensure we have at least 12 elements
        while (values.length < 12) {
            values.push('');
        }

        const [taskName, subtaskName, description, assigneeEmail, reviewerEmail, startDate, days, status, tag1, tag2, tag3, tag4] = values;

        const tags = [tag1, tag2, tag3, tag4].filter(t => t && t.trim()).map(t => t.trim());

        return {
            taskName: taskName.trim().replace(/\s+/g, ' '),
            subtaskName: subtaskName?.trim() || undefined,
            description: description?.trim() || undefined,
            assigneeEmail: assigneeEmail ? assigneeEmail.trim().split(/\s+/)[0].toLowerCase() : undefined,
            reviewerEmail: reviewerEmail ? reviewerEmail.trim().split(/\s+/)[0].toLowerCase() : undefined,
            startDate: startDate?.trim() || undefined,
            days: days?.trim() ? parseInt(days.trim()) : undefined,
            status: status?.trim() || undefined,
            tags: tags.length > 0 ? tags : undefined,
        };
    };

    const parseCSV = (text: string): ParsedTask[] => {
        const sanitizedText = sanitizeString(text);

        // Correctly split into rows respecting newlines within quotes
        const rows: string[] = [];
        let currentPos = 0;
        let inQuotes = false;
        
        for (let i = 0; i < sanitizedText.length; i++) {
            const char = sanitizedText[i];
            if (char === '"') inQuotes = !inQuotes;
            if ((char === '\n' || char === '\r') && !inQuotes) {
                const line = sanitizedText.substring(currentPos, i).trim();
                if (line) rows.push(line);
                if (char === '\r' && sanitizedText[i+1] === '\n') i++;
                currentPos = i + 1;
            }
        }
        const lastLine = sanitizedText.substring(currentPos).trim();
        if (lastLine) rows.push(lastLine);

        if (rows.length < 2) {
            throw new Error("CSV file is empty or invalid - must contain header and at least one data row");
        }

        const headerLine = rows[0].toLowerCase();
        const hasRequiredColumns = headerLine.includes('task name') && headerLine.includes('subtask name');
        if (!hasRequiredColumns) {
            throw new Error("Invalid CSV format - missing required columns. Please use the template file.");
        }

        const dataRows = rows.slice(1);
        const tasks: ParsedTask[] = [];

        for (const row of dataRows) {
            const values = parseCSVLine(row);
            const task = mapValuesToTask(values);
            
            if (task.taskName) {
                tasks.push(task);
            }
        }

        if (tasks.length === 0) {
            throw new Error("No valid task data found in CSV file");
        }

        return tasks;
    };

    const handleSubmit = async (dataToUpload: ParsedTask[]) => {
        const exampleEmails = ["john@example.com", "jane@example.com", "vendor@example.com", "admin@example.com"];
        const filteredData = dataToUpload.filter(task => {
            const assignee = task.assigneeEmail?.toLowerCase();
            const reviewer = task.reviewerEmail?.toLowerCase();
            return !exampleEmails.includes(assignee || "") && !exampleEmails.includes(reviewer || "");
        });

        if (filteredData.length === 0) {
            toast.error("No valid tasks found (all rows were either empty or contained example emails)");
            return;
        }

        console.log("📤 Uploading Tasks:", filteredData.length);
        startTransition(async () => {
            setIsAddingTask(true);
            setIsProcessing(true);
            setProgress(5);
            const toastId = toast.loading("Uploading tasks to database...");

            // Simulate progress for the on-screen bar
            const progressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 95) return 95;
                    return prev + Math.floor(Math.random() * 5) + 1;
                });
            }, 400);

            try {
                const { data: result, error } = await tryCatch<ApiResponse>(
                    apiClient.tasks.bulkUpload(
                        projectId,
                        filteredData.map((task: ParsedTask) => ({
                            ...task,
                            reviewerEmail: task.reviewerEmail || projectMembers.find((m: any) => m.userId === selectedReviewerId)?.user.email
                        })),
                    )
                );

                clearInterval(progressInterval);

                if (error) {
                    console.error('❌ Bulk Upload Error:', error);
                    toast.error(error.message || 'An unexpected error occurred', { id: toastId });
                    return;
                }

                if (result) {
                    setProgress(100);
                    toast.success('Tasks uploaded successfully!', { id: toastId });
                    triggerConfetti();

                    const newTasks = result.data as any[];
                    if (newTasks && newTasks.length > 0) {
                        useTaskCacheStore.getState().upsertTasks(newTasks);
                    }

                    setTimeout(() => {
                        setOpen(false);
                        router.refresh();
                    }, 500);
                } else {
                    toast.error('Upload failed. Please try again.', { id: toastId });
                }
            } catch (err) {
                clearInterval(progressInterval);
                console.error('❌ Bulk Upload Exception:', err);
                toast.error('An unexpected error occurred', { id: toastId });
            } finally {
                setIsAddingTask(false);
                setIsProcessing(false);
            }
        });
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            setFileName(file.name);
            setIsProcessing(true);

            try {
                let parsed: ParsedTask[] = [];

                if (file.name.endsWith('.xlsx')) {
                    const ExcelJS = (await import('exceljs')).default;
                    const workbook = new ExcelJS.Workbook();
                    const buffer = await file.arrayBuffer();
                    await workbook.xlsx.load(buffer);

                    const worksheet = workbook.getWorksheet(1);
                    if (!worksheet) throw new Error("Worksheet not found in Excel file");

                    const rows: string[][] = [];
                    worksheet.eachRow((row, rowNumber) => {
                        if (rowNumber === 1) return; // Skip header
                        const rowData: string[] = [];
                        // Read all cells in the row (ExcelJS is 1-indexed)
                        for (let i = 1; i <= 12; i++) {
                            const cell = row.getCell(i);
                            let value = cell.value;
                            if (value instanceof Date) {
                                value = format(value, APP_DATE_FORMAT);
                            } else if (value && typeof value === 'object' && 'result' in value) {
                                value = String(value.result);
                            } else {
                                value = value ? String(value) : '';
                            }
                            rowData.push(value);
                        }
                        rows.push(rowData);
                    });

                    parsed = rows.map(r => mapValuesToTask(r));
                } else {
                    const text = await file.text();
                    parsed = parseCSV(text);
                }

                if (parsed.length === 0) {
                    toast.error("No valid tasks found in the file");
                    return;
                }

                setParsedData(parsed);
                // We stay on the upload view now as per user request
            } catch (err) {
                console.error("Upload error:", err);
                toast.error(err instanceof Error ? err.message : "Failed to parse file");
            } finally {
                setIsProcessing(false);
            }
        }
    }, [projectId, projectMembers, selectedReviewerId]);

    const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
        if (fileRejections.length) {
            const tooManyFiles = fileRejections.find(
                (rejection) => rejection.errors[0].code === 'too-many-files'
            );

            const fileSizeToBig = fileRejections.find(
                (rejection) => rejection.errors[0].code === 'file-too-large'
            );

            const wrongFileType = fileRejections.find(
                (rejection) => rejection.errors[0].code === 'file-invalid-type'
            );

            if (tooManyFiles) {
                toast.error('Too many files selected, max is 1');
            }

            if (fileSizeToBig) {
                toast.error('File size exceeds the limit (10MB)');
            }

            if (wrongFileType) {
                toast.error('Invalid file type. Please upload a CSV file');
            }
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.ms-excel': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm']
        },
        maxFiles: 1,
        multiple: false,
        maxSize: 10 * 1024 * 1024,
        onDropRejected,
        disabled: pending || isProcessing,
    });

    return (
        <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
                setParsedData([]);
                setFileName("");
                setProgress(0);
            }
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9 border-border/60 hover:bg-muted/50 transition-colors cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Bulk Upload</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        Bulk Task Upload
                    </DialogTitle>
                </DialogHeader>

                <div className="relative space-y-6 py-4">
                    {(isProcessing || pending) && (
                        <div className="absolute inset-0 bg-background/80 z-[100] flex flex-col items-center justify-center p-6 text-center rounded-lg border shadow-lg">
                            <div className="w-full max-w-xs space-y-6 bg-background p-4 rounded-lg">
                                <div className="flex items-center justify-center">
                                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                </div>
                                
                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-foreground">
                                        {progress === 100 ? "Success!" : "Processing..."}
                                    </h3>
                                    <p className="text-[10px] text-muted-foreground">
                                        {progress < 100 ? "Uploading to database..." : "Finalizing..."}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-medium px-1">
                                        <span>Progress</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <Progress value={progress} className="h-1.5 w-full" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-center gap-2 mb-1">
                                <FileText className="h-4 w-4 text-primary" />
                                <h4 className="text-sm font-semibold">Instructions</h4>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Read the requirements for the file format and valid values.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full text-xs h-8 bg-white dark:bg-gray-900 border-border/40 hover:bg-muted/60"
                                onClick={downloadInstructions}
                            >
                                Download Instructions
                            </Button>
                        </div>

                        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-center gap-2 mb-1">
                                <Download className="h-4 w-4 text-green-600" />
                                <h4 className="text-sm font-semibold">Template File</h4>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Download a sample file with the correct columns and examples.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full text-xs h-8 bg-white dark:bg-gray-900 border-border/40 hover:bg-muted/60"
                                onClick={downloadTemplate}
                            >
                                Download Excel Template
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Global Reviewer (Optional)</Label>
                            <p className="text-xs text-muted-foreground">
                                This reviewer will be assigned to all tasks that don&apos;t have a reviewer email in the file.
                            </p>
                            <Select
                                value={selectedReviewerId}
                                onValueChange={setSelectedReviewerId}
                                disabled={isProcessing}
                            >
                                <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select a default reviewer" />
                                </SelectTrigger>
                                <SelectContent>
                                    {projectMembers
                                        .filter((m: any) => ["OWNER", "ADMIN", "LEAD", "PROJECT_MANAGER"].includes(m.projectRole) || ["OWNER", "ADMIN"].includes(m.workspaceRole || ""))
                                        .map((member: any) => (
                                            <SelectItem key={member.userId} value={member.userId}>
                                                {member.user.email} ({member.user.surname}{member.projectRole ? ` - ${member.projectRole.replace('_', ' ')}` : ""})
                                            </SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label>Upload File</Label>
                        <div
                            {...getRootProps()}
                            className={cn(
                                "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group",
                                isDragActive ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50 hover:bg-muted/30",
                                isProcessing && "opacity-50 pointer-events-none"
                            )}
                        >
                            <input {...getInputProps()} />
                            <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                {fileName ? (
                                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                                ) : (
                                    <Upload className="h-8 w-8 text-primary" />
                                )}
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium">
                                    {fileName ? fileName : (isDragActive ? "Drop the file here" : "Click or drag file to upload")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {fileName ? `${parsedData.length} items found` : "CSV or XLSX files supported"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Progress bar removed from here as it is now in the overlay */}
                </div>

                <DialogFooter className="mt-4 flex items-center justify-between w-full">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        disabled={pending || isProcessing}
                        className="h-9"
                    >
                        Cancel
                    </Button>

                    <Button
                        type="button"
                        onClick={() => handleSubmit(parsedData)}
                        disabled={pending || isProcessing || parsedData.length === 0}
                        className="h-9 gap-2 min-w-[120px]"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Uploading...</span>
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4" />
                                <span>Submit</span>
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
