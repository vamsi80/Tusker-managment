"use client";

import { useState, useTransition, useCallback } from "react";
import { Loader2, Download, FileSpreadsheet, Info, Upload, X, Check, FileText, Tag } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

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
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { APP_DATE_FORMAT } from "@/lib/utils";


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
                // Handle escaped quotes (""")
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

    const parseCSV = (text: string): ParsedTask[] => {
        const sanitizedText = sanitizeString(text);

        // Normalize line endings and split
        const lines = sanitizedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            throw new Error("CSV file is empty or invalid");
        }

        const dataLines = lines.slice(1);
        const tasks: ParsedTask[] = [];

        for (const line of dataLines) {
            const values = parseCSVLine(line);

            // Pad the values array to ensure we have at least 10 elements
            while (values.length < 10) {
                values.push('');
            }

            const [taskName, subtaskName, description, assigneeEmail, reviewerEmail, startDate, days, status, tag1, tag2, tag3, tag4] = values;

            if (!taskName) continue;

            const tags = [tag1, tag2, tag3, tag4].filter(t => t && t.trim()).map(t => t.trim());

            tasks.push({
                taskName,
                subtaskName: subtaskName || undefined,
                description: description || undefined,
                assigneeEmail: assigneeEmail ? assigneeEmail.split(' ')[0].trim() : undefined,
                reviewerEmail: reviewerEmail ? reviewerEmail.split(' ')[0].trim() : undefined,
                startDate: startDate || undefined,
                days: days ? parseInt(days) : undefined,
                status: status || undefined,
                tags: tags.length > 0 ? tags : undefined,
            });
        }

        return tasks;
    };

    // const clearFile = () => {
    //     setParsedData([]);
    //     setFileName("");
    // };

    // const processFile = async (file: File) => {
    //     setFileName(file.name);

    //     try {
    //         const text = await file.text();

    //         // Check if file contains too many non-printable/binary characters
    //         const nonPrintableCount = (text.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\xFF]/g) || []).length;
    //         const totalChars = text.length;
    //         const nonPrintableRatio = totalChars > 0 ? nonPrintableCount / totalChars : 0;

    //         if (nonPrintableRatio > 0.2) {
    //             toast.error(
    //                 "❌ File Upload Failed: The file appears to be corrupted or contains binary data.\n\n" +
    //                 "Cannot validate assignee emails or other data because the file cannot be read properly.\n\n" +
    //                 "Please create a new CSV file:\n" +
    //                 "• Use the template file (test-bulk-upload.csv)\n" +
    //                 "• Or create a new file in Notepad/Google Sheets\n" +
    //                 "• Save as UTF-8 CSV format",
    //                 { duration: 8000 }
    //             );
    //             setParsedData([]);
    //             setFileName("");
    //             return;
    //         }

    //         const hasCommas = text.includes(',');
    //         const hasNewlines = text.includes('\n') || text.includes('\r');

    //         if (!hasCommas || !hasNewlines) {
    //             toast.error("The file doesn't appear to be a valid CSV. Please ensure it's a comma-separated values file.");
    //             setParsedData([]);
    //             setFileName("");
    //             return;
    //         }

    //         const parsed = parseCSV(text);

    //         console.log('Parsed CSV:', parsed.length, 'rows');

    //         if (parsed.length === 0) {
    //             toast.error("No valid data found in file");
    //             return;
    //         }

    //         setParsedData(parsed);
    //         toast.success(`Parsed ${parsed.length} rows successfully`);
    //     } catch (error) {
    //         toast.error(error instanceof Error ? error.message : "Failed to parse file");
    //         setParsedData([]);
    //         setFileName("");
    //     }
    // };

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
                        // Handle up to 12 columns (Task, Subtask, Desc, Assignee, Reviewer, Date, Days, Status, Tag1, Tag2, Tag3, Tag4)
                        for (let i = 1; i <= 12; i++) {
                            const cell = row.getCell(i);
                            let value = cell.value;
                            if (value instanceof Date) {
                                value = format(value, APP_DATE_FORMAT);
                            } else if (value && typeof value === 'object' && 'result' in value) {
                                // Formula cell
                                value = String(value.result);
                            } else {
                                value = value ? String(value) : '';
                            }
                            rowData.push(value);
                        }
                        rows.push(rowData);
                    });
                    
                    parsed = rows.filter(r => r[0]).map(r => {
                        const [taskName, subtaskName, description, assigneeEmail, reviewerEmail, startDate, days, status, tag1, tag2, tag3, tag4] = r;
                        const tags = [tag1, tag2, tag3, tag4].filter(t => t && t.trim()).map(t => t.trim());
                        return {
                            taskName,
                            subtaskName: subtaskName || undefined,
                            description: description || undefined,
                            assigneeEmail: assigneeEmail ? assigneeEmail.split(' ')[0].trim() : undefined,
                            reviewerEmail: reviewerEmail ? reviewerEmail.split(' ')[0].trim() : undefined,
                            startDate: startDate || undefined,
                            days: days ? parseInt(days) : undefined,
                            status: status || undefined,
                            tags: tags.length > 0 ? tags : undefined,
                        };
                    });
                } else {
                    const text = await file.text();
                    parsed = parseCSV(text);
                }

                if (parsed.length === 0) {
                    toast.error("No valid tasks found in the file");
                    setIsProcessing(false);
                    return;
                }

                setParsedData(parsed);
                setView("preview");
                toast.success(`Parsed ${parsed.length} items. Please review before uploading.`);
            } catch (err) {
                console.error("Upload error:", err);
                toast.error(err instanceof Error ? err.message : "Failed to parse file");
            } finally {
                setIsProcessing(false);
            }
        }
    }, [projectId, parseCSV]);


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
        disabled: pending || parsedData.length > 0,
    });

    const updateParsedDataItem = (index: number, field: keyof ParsedTask, value: any) => {
        const newData = [...parsedData];
        newData[index] = { ...newData[index], [field]: value };
        setParsedData(newData);
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (parsedData.length === 0) {
            toast.error("Please upload a file first");
            return;
        }

        startTransition(async () => {
            setIsAddingTask(true);
            const { data: result, error } = await tryCatch<ApiResponse>(
                apiClient.tasks.bulkUpload(
                    projectId,
                    parsedData.map((task: ParsedTask) => ({
                        ...task,
                        reviewerEmail: task.reviewerEmail || projectMembers.find((m: any) => m.userId === selectedReviewerId)?.user.email
                    })),
                )

            );

            if (error) {
                console.error('❌ Bulk Upload Error:', error);
                toast.error(error.message || 'An unexpected error occurred');
                setIsAddingTask(false);
                return;
            }

            if (result && result.status === "success") {
                toast.success(result.message || "Tasks uploaded successfully");
                triggerConfetti();

                const newTasks = result.data as any[];
                if (newTasks && newTasks.length > 0) {
                    useTaskCacheStore.getState().upsertTasks(newTasks);
                }

                setParsedData([]);
                setFileName("");
                setView("upload");
                setOpen(false);
            } else {
                toast.error(result?.message || 'Upload failed. Please try again.');
                setIsAddingTask(false);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
                setView("upload");
                setParsedData([]);
                setFileName("");
            }
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9 border-border/60 hover:bg-muted/50 transition-colors">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Bulk Upload</span>
                </Button>
            </DialogTrigger>
            <DialogContent className={cn(
                "sm:max-w-[600px] transition-all duration-300",
                view === "preview" && "sm:max-w-[1000px] max-h-[90vh]"
            )}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        {view === "upload" ? "Bulk Task Upload" : "Review Tasks"}
                    </DialogTitle>
                    <DialogDescription>
                        {view === "upload"
                            ? "Upload a CSV or Excel file to create multiple tasks and subtasks at once."
                            : `Review and edit the ${parsedData.length} items from "${fileName}" before uploading.`}
                    </DialogDescription>
                </DialogHeader>

                {view === "upload" ? (
                    <div className="space-y-6 py-4">
                        {/* Instructions & Template Buttons */}
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

                        {/* File Upload */}
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
                                    {isProcessing ? (
                                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                    ) : (
                                        <Upload className="h-8 w-8 text-primary" />
                                    )}
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium">
                                        {isDragActive ? "Drop the file here" : "Click or drag file to upload"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        CSV or XLSX files supported
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-4">
                        <div className="border rounded-lg overflow-hidden bg-muted/10">
                            <ScrollArea className="h-[400px] w-full">
                                <table className="w-full text-sm border-collapse">
                                    <thead className="bg-muted/50 sticky top-0 z-10">
                                        <tr>
                                            <th className="p-2 text-left border-b font-medium min-w-[150px]">Task / Subtask</th>
                                            <th className="p-2 text-left border-b font-medium min-w-[180px]">Assignee Email</th>
                                            <th className="p-2 text-left border-b font-medium min-w-[180px]">Reviewer Email</th>
                                            <th className="p-2 text-left border-b font-medium min-w-[150px]">Tags</th>
                                            <th className="p-2 text-left border-b font-medium w-[80px]">Days</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedData.map((item: ParsedTask, idx: number) => (
                                            <tr key={idx} className="hover:bg-muted/5 group">
                                                <td className="p-2 border-b">
                                                    <div className="font-medium truncate max-w-[140px]" title={item.taskName}>
                                                        {item.taskName}
                                                    </div>
                                                    {item.subtaskName && (
                                                        <div className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={item.subtaskName}>
                                                            ↳ {item.subtaskName}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-2 border-b">
                                                    <Select
                                                        value={item.assigneeEmail || "unassigned"}
                                                        onValueChange={(val) => updateParsedDataItem(idx, "assigneeEmail", val === "unassigned" ? "" : val)}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs border-transparent group-hover:border-border transition-colors">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="unassigned">Unassigned</SelectItem>
                                                            {projectMembers.map((m: any) => (
                                                                <SelectItem key={m.userId} value={m.user.email} className="text-xs">
                                                                    {m.user.email} ({m.user.surname})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="p-2 border-b">
                                                    <Select
                                                        value={item.reviewerEmail || "default"}
                                                        onValueChange={(val) => updateParsedDataItem(idx, "reviewerEmail", val === "default" ? "" : val)}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs border-transparent group-hover:border-border transition-colors">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="default">Default Reviewer</SelectItem>
                                                            {projectMembers
                                                                .filter((m: any) => ["OWNER", "ADMIN", "LEAD", "PROJECT_MANAGER"].includes(m.projectRole) || ["OWNER", "ADMIN"].includes(m.workspaceRole || ""))
                                                                .map((m: any) => (
                                                                    <SelectItem key={m.userId} value={m.user.email} className="text-xs">
                                                                        {m.user.email} ({m.user.surname}{m.projectRole ? ` - ${m.projectRole.replace('_', ' ')}` : ""})
                                                                    </SelectItem>
                                                                ))
                                                            }
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="p-2 border-b">
                                                    <div className="flex flex-wrap gap-1 min-w-[140px]">
                                                        {item.tags && item.tags.map((tagName, tagIdx) => (
                                                            <Badge key={tagIdx} variant="secondary" className="text-[10px] py-0 px-1 whitespace-nowrap flex items-center gap-1">
                                                                {tagName}
                                                                <button
                                                                    onClick={() => {
                                                                        const newTags = item.tags?.filter((_, i) => i !== tagIdx);
                                                                        updateParsedDataItem(idx, "tags", newTags);
                                                                    }}
                                                                    className="hover:text-destructive transition-colors"
                                                                >
                                                                    <X className="h-2 w-2" />
                                                                </button>
                                                            </Badge>
                                                        ))}
                                                        <Select
                                                            onValueChange={(val) => {
                                                                const currentTags = item.tags || [];
                                                                if (!currentTags.includes(val)) {
                                                                    updateParsedDataItem(idx, "tags", [...currentTags, val]);
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-6 w-6 p-0 border-none bg-muted/50 hover:bg-muted rounded-full flex items-center justify-center">
                                                                <Tag className="h-3 w-3" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {workspaceTags.map((t: any) => (
                                                                    <SelectItem key={t.id} value={t.name} className="text-xs">
                                                                        {t.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </td>
                                                <td className="p-2 border-b">
                                                    <input
                                                        type="number"
                                                        value={item.days || ""}
                                                        onChange={(e) => updateParsedDataItem(idx, "days", parseInt(e.target.value) || 0)}
                                                        className="w-full h-8 bg-transparent text-xs focus:outline-none border-b border-transparent group-hover:border-border transition-colors px-1"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>

                                </table>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground px-1">
                            <p>Tip: You can edit values directly in this table before uploading.</p>
                            <p className="font-medium text-primary">{parsedData.length} total items</p>
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0 mt-4">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            if (view === "preview") {
                                setView("upload");
                            } else {
                                setOpen(false);
                            }
                        }}
                        disabled={pending}
                        className="h-9"
                    >
                        {view === "preview" ? "Back to Upload" : "Cancel"}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={pending || parsedData.length === 0}
                        className={cn(
                            "h-9 gap-2 transition-all min-w-[140px]",
                            view === "preview" && "bg-green-600 hover:bg-green-700 text-white"
                        )}
                    >
                        {pending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Uploading...</span>
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4" />
                                <span>{view === "upload" ? "Upload Tasks" : "Confirm & Create"}</span>
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


