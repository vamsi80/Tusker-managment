"use client";

import { useState, useTransition, useCallback } from "react";
import { Loader2, Download, FileSpreadsheet, Upload, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "@/lib/toast";
import { useTaskContext } from "@/app/w/[workspaceId]/_components/shared/task-context";

import { useDropzone, FileRejection } from "react-dropzone";
import { cn } from "@/lib/utils";
import { apiClient } from "@tusker/api-client";
import { useProjectLayout } from "../project-layout-context";

import { useEffect } from "react";
import { format } from "date-fns";
import { APP_DATE_FORMAT } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";


interface BulkUploadFormProps {
    projectId: string;
}

interface ParsedTask {
    /** Set on rows from an exported sheet; such rows update the existing task. */
    id?: string;
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
    const { setIsAddingTask } = useTaskContext();
    const { projectMembers, workspaceId, workspaceTags, revalidate } = useProjectLayout();
    const [fileName, setFileName] = useState<string>("");
    const [selectedReviewerId, setSelectedReviewerId] = useState<string>("");
    const [view, setView] = useState<"upload" | "preview">("upload");
    const [isProcessing, setIsProcessing] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedTask[]>([]);
    // From the hidden DataLists sheet of an exported file; only then do missing rows delete.
    const [exportedAt, setExportedAt] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);


    useEffect(() => {
        if (open) {
            revalidate();
        }
    }, [open, revalidate]);


    const memberLabel = (m: any) => m.user.surname ? `${m.user.email} (${m.user.surname})` : m.user.email;
    const reviewerLabel = (m: any) => {
        const role = m.projectRole ? ` [${m.projectRole.replace('_', ' ')}]` : "";
        return m.user.surname ? `${m.user.email} (${m.user.surname}${role})` : `${m.user.email}${role}`;
    };

    const saveWorkbook = async (workbook: any, fileName: string) => {
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
    };

    /** Template and export share one layout; the export adds row IDs and its timestamp. */
    const buildWorkbook = async (dataRows: any[][], exportStamp?: string) => {
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
            { header: 'Tag 4', key: 'tag4', width: 15 },
            { header: 'ID (do not edit, blank for new rows)', key: 'id', width: 38 }
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
        worksheet.getCell('M1').font = { bold: true, color: { argb: 'FF9CA3AF' } };
        worksheet.getColumn(13).font = { color: { argb: 'FF9CA3AF' } };

        worksheet.addRows(dataRows);

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
            ? projectMembers.map(memberLabel)
            : ["john@example.com (John)", "mike@example.com (Mike)"];
        refSheet.getColumn(3).values = ["Emails", ...memberEmails];

        // Add reviewer candidates (Owner/Admin/Lead/PM)
        const reviewerEmails = projectMembers.length > 0
            ? projectMembers
                .filter((m: any) => m.projectRole && ["OWNER", "ADMIN", "LEAD", "PROJECT_MANAGER"].includes(m.projectRole))
                .map(reviewerLabel)
            : memberEmails;
        refSheet.getColumn(4).values = ["Reviewers", ...reviewerEmails];

        // Read back on upload: its presence is what lets missing rows delete tasks.
        if (exportStamp) refSheet.getColumn(5).values = ["ExportedAt", exportStamp];


        // 3. Define Names for ranges (for validation)
        const statusRange = `DataLists!$A$2:$A$${statuses.length + 1}`;
        const tagRange = `DataLists!$B$2:$B$${tagNames.length + 1}`;
        const emailRange = `DataLists!$C$2:$C$${memberEmails.length + 1}`;
        const reviewerRange = `DataLists!$D$2:$D$${reviewerEmails.length + 1}`;

        // 4. Apply Data Validation to the data plus 100 spare rows
        for (let i = 2; i <= Math.max(106, dataRows.length + 101); i++) {
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

        return workbook;
    };

    const downloadTemplate = async () => {
        // Add Example Rows matching the instructions
        const exampleRows = [
            ["Design Homepage", "", "", "", "", "", "", "", "", ""],
            ["Design Homepage", "Create wireframe", "Design wireframe mockup", "john@example.com", "admin@example.com", "15 Apr 2026", 3, "COMPLETED", "DESIGN", ""],
            ["Design Homepage", "Design components", "Create reusable UI components", "jane@example.com", "", "18 Apr 2026", 4, "IN_PROGRESS", "DESIGN", ""],
            ["Procurement", "", "", "", "", "", "", "", "", ""],
            ["Procurement", "Get quotes", "Collect vendor quotes", "vendor@example.com", "admin@example.com", "20 Apr 2026", 2, "TO_DO", "PROCUREMENT", "URGENT", "TAG-3", "TAG-4"]
        ];
        await saveWorkbook(await buildWorkbook(exampleRows), "bulk_upload_template");
        toast.success("Excel template with dropdowns downloaded successfully");
    };

    const exportTasks = async () => {
        const { data, error } = await tryCatch(apiClient.tasks.bulkExport(projectId));
        if (error || !data) {
            toast.error(error?.message || "Failed to export tasks");
            return;
        }
        // Write emails in the same "email (Name)" form the dropdowns offer.
        const byEmail = new Map(projectMembers.map((m: any) => [m.user.email.toLowerCase(), m]));
        const label = (email: string | null, fn: (m: any) => string) => {
            const m = email ? byEmail.get(email.toLowerCase()) : undefined;
            return m ? fn(m) : email ?? "";
        };
        const rows = data.rows.flatMap((r: any, i: number) => {
            const [y, mo, d] = (r.startDate ?? "").split("-").map(Number);
            const tags = [...(r.tags ?? [])];
            // Two blank rows before each main task; blank rows are skipped on upload.
            const gap = !r.subtaskName && i > 0 ? [[], []] : [];
            return [...gap, [
                r.taskName, r.subtaskName ?? "", r.description ?? "",
                label(r.assigneeEmail, memberLabel), label(r.reviewerEmail, reviewerLabel),
                r.startDate ? new Date(Date.UTC(y, mo - 1, d)) : "",
                r.days ?? "", r.status ?? "",
                tags[0] ?? "", tags[1] ?? "", tags[2] ?? "", tags[3] ?? "",
                r.id,
            ]];
        });
        await saveWorkbook(await buildWorkbook(rows, data.exportedAt), "project_tasks");
        toast.success(`Exported ${data.rows.length} rows. Edit and upload the file here to apply changes.`);
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

            10. ID (EXPORTED FILES ONLY)
            - Filled in by "Export Current Tasks". Do not edit it.
            - Leave it blank on rows you add; clear it on rows you copy.

            EDITING EXISTING TASKS:
            ----------------------
            1. Click "Export Current Tasks" and open the file
            2. Change any cell on a row to update that task
            3. Add rows (with no ID) to create tasks; a new subtask row whose
               Task Name matches an existing task is added under it
            4. Delete a row to delete that task (deleting a task row deletes its subtasks)
            5. Upload the file here; you will see what will be created, updated
               and deleted before anything is saved
            - Status changes follow the usual rules (Completed only from Review;
              changes that need a comment must be made in the app)
            - A subtask changed in the app after you exported is skipped; export again
            - Changing the Task Name on a subtask row does not move it to another task

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
        // Pad the values array to ensure we have at least 13 elements
        while (values.length < 13) {
            values.push('');
        }

        const [taskName, subtaskName, description, assigneeEmail, reviewerEmail, startDate, days, status, tag1, tag2, tag3, tag4, id] = values;

        const tags = [tag1, tag2, tag3, tag4].filter(t => t && t.trim()).map(t => t.trim());

        return {
            id: id?.trim() || undefined,
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

        const payload = filteredData.map((task: ParsedTask) => ({
            ...task,
            reviewerEmail: task.reviewerEmail || projectMembers.find((m: any) => m.userId === selectedReviewerId)?.user.email
        }));
        const sync = exportedAt ? { exportedAt } : undefined;
        const isSync = !!sync || payload.some(t => t.id);

        // Edits and deletes can't be undone in bulk, so show what will happen first.
        if (isSync) {
            setIsProcessing(true);
            const { data: preview, error } = await tryCatch(apiClient.tasks.bulkUpload(projectId, payload, { sync, dryRun: true }));
            setIsProcessing(false);
            if (error || !preview?.summary) {
                toast.error(error?.message || "Could not check the file");
                return;
            }
            const s = preview.summary;
            if (s.created + s.updated + s.deleted === 0) {
                toast.info(`No changes found (${s.unchanged} rows unchanged).`);
                return;
            }
            const names = s.deletedNames.slice(0, 10).map(n => `  - ${n}`).join("\n");
            const more = s.deletedNames.length > 10 ? `\n  ...and ${s.deletedNames.length - 10} more` : "";
            const ok = window.confirm(
                `Create ${s.created}, update ${s.updated}, DELETE ${s.deleted}, unchanged ${s.unchanged}.` +
                (s.deleted ? `\n\nThese will be deleted:\n${names}${more}` : "") +
                (s.errors.length ? `\n\nNotes:\n${s.errors.slice(0, 5).join("\n")}` : "") +
                "\n\nApply these changes?"
            );
            if (!ok) return;
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
                const { data: result, error } = await tryCatch(
                    apiClient.tasks.bulkUpload(projectId, payload, { sync })
                );

                clearInterval(progressInterval);

                if (error) {
                    console.error('❌ Bulk Upload Error:', error);
                    toast.error(error.message || 'An unexpected error occurred', { id: toastId });
                    return;
                }

                if (result) {
                    setProgress(100);
                    const failures = result.summary?.errors ?? [];
                    if (failures.length) {
                        console.warn("Bulk sync rows not applied:", failures);
                        toast.warning(result.message, {
                            id: toastId,
                            description: failures.slice(0, 5).join("\n") + (failures.length > 5 ? `\n...and ${failures.length - 5} more` : ""),
                            duration: 20000,
                        });
                    } else {
                        toast.success(result.message || 'Tasks uploaded successfully!', { id: toastId });
                    }
                    triggerConfetti();

                    // Dispatch only parent tasks — subtasks load from DB on expand
                    if (result.data && Array.isArray(result.data)) {
                        result.data
                            .filter((t: any) => t.isParent)
                            .forEach((task: any) => {
                                window.dispatchEvent(
                                    new CustomEvent("realtime-task-sync", {
                                        detail: {
                                            action: "TASK_CREATED",
                                            record: task,
                                        },
                                    })
                                );
                            });
                    }

                    setTimeout(async () => {
                        setOpen(false);
                        setParsedData([]);
                        setFileName("");
                        setExportedAt(null);
                        setProgress(0);
                        // Many in-place edits/deletes at once: reload rather than patch the list row by row.
                        if (result.summary && (result.summary.updated || result.summary.deleted)) {
                            window.location.reload();
                            return;
                        }
                        await revalidate();
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
                let stamp: string | null = null;

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
                        for (let i = 1; i <= 13; i++) {
                            const cell = row.getCell(i);
                            let value = cell.value;
                            if (value instanceof Date) {
                                // Excel dates are calendar days at UTC midnight; read them in UTC.
                                value = format(new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()), APP_DATE_FORMAT);
                            } else if (value && typeof value === 'object' && 'result' in value) {
                                value = String(value.result);
                            } else if (value && typeof value === 'object' && 'richText' in value) {
                                value = value.richText.map(r => r.text).join('');
                            } else if (value && typeof value === 'object' && 'text' in value) {
                                // Emails Excel turned into mailto links
                                value = String(value.text);
                            } else {
                                value = value ? String(value) : '';
                            }
                            rowData.push(value);
                        }
                        // Keep sheet positions so server "Row N" errors match Excel; blank rows become holes.
                        rows[rowNumber - 2] = rowData;
                    });

                    parsed = Array.from(rows, r => mapValuesToTask(r ?? []));
                    const cell = workbook.getWorksheet("DataLists")?.getCell("E2").value;
                    stamp = typeof cell === "string" && cell ? cell : null;
                } else {
                    const text = await file.text();
                    parsed = parseCSV(text);
                }

                if (parsed.length === 0) {
                    toast.error("No valid tasks found in the file");
                    return;
                }

                setParsedData(parsed);
                setExportedAt(stamp);
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
                setExportedAt(null);
                setProgress(0);
            }
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9 border-border/60 hover:bg-muted/50 transition-colors cursor-pointer">
                    <FileSpreadsheet className="size-4" />
                    <span>Bulk Upload</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="size-5 text-primary" />
                        Bulk Task Upload
                    </DialogTitle>
                </DialogHeader>

                <div className="relative space-y-6 py-4">
                    {(isProcessing || pending) && (
                        <div className="absolute inset-0 bg-background/80 z-[100] flex flex-col items-center justify-center p-6 text-center rounded-lg border shadow-lg">
                            <div className="w-full max-w-xs space-y-6 bg-background p-4 rounded-lg">
                                <div className="flex items-center justify-center">
                                    <Loader2 className="size-8 text-primary animate-spin" />
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
                                <FileText className="size-4 text-primary" />
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
                                <Download className="size-4 text-green-600" />
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

                        <div className="space-y-3 border rounded-lg p-4 bg-muted/30 sm:col-span-2">
                            <div className="flex items-center gap-2 mb-1">
                                <FileSpreadsheet className="size-4 text-blue-600" />
                                <h4 className="text-sm font-semibold">Edit Existing Tasks</h4>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Download this project&apos;s tasks, edit them in Excel and upload the file here. Changed rows are updated, new rows are added, and rows you delete are deleted. You confirm before anything is saved.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full text-xs h-8 bg-white dark:bg-gray-900 border-border/40 hover:bg-muted/60"
                                onClick={exportTasks}
                            >
                                Export Current Tasks
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
                                    <FileSpreadsheet className="size-8 text-green-600" />
                                ) : (
                                    <Upload className="size-8 text-primary" />
                                )}
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium">
                                    {fileName ? fileName : (isDragActive ? "Drop the file here" : "Click or drag file to upload")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {fileName ? `${parsedData.filter(t => t.taskName).length} items found` : "CSV or XLSX files supported"}
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
                                <Loader2 className="size-4 animate-spin" />
                                <span>Uploading...</span>
                            </>
                        ) : (
                            <>
                                <Upload className="size-4" />
                                <span>Submit</span>
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
