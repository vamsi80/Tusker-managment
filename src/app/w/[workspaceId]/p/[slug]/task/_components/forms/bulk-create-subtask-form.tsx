"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import slugify from "slugify";
import { bulkCreateSubTasks } from "../../action";
import { useRouter } from "next/navigation";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface BulkCreateSubTaskFormProps {
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    parentTaskId: string;
    onSubTaskCreated?: (subTasks: any[]) => void;
}

interface SubTaskInput {
    name: string;
    slug: string;
    description: string;
    tag: "DESIGN" | "PROCUREMENT" | "CONTRACTOR";
    startDate: string;
    days: number;
    assignee: string;
}

export const BulkCreateSubTaskForm = ({
    members,
    workspaceId,
    projectId,
    parentTaskId,
    onSubTaskCreated,
}: BulkCreateSubTaskFormProps) => {
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<SubTaskInput[]>([]);

    // Upload progress tracking
    const [uploadProgress, setUploadProgress] = useState({
        total: 0,
        uploaded: 0,
        status: 'idle' as 'idle' | 'uploading' | 'success' | 'error',
        message: ''
    });

    const filteredMembers = members?.filter((member) => {
        const role = member.workspaceMember.workspaceRole;
        return role !== "VIEWER" && role !== "ADMIN";
    });

    // Download Excel Template
    const downloadTemplate = () => {
        const templateData = [
            {
                'Name': 'Example Task 1',
                'Description': 'This is a sample description',
                'Tag': 'CONTRACTOR',
                'Start Date': '2024-01-15',
                'Days': 5,
                'Assignee Email': filteredMembers?.[0]?.workspaceMember.user.email || 'user@example.com',
            },
            {
                'Name': 'Example Task 2',
                'Description': 'Another sample task',
                'Tag': 'DESIGN',
                'Start Date': '2024-01-20',
                'Days': 3,
                'Assignee Email': filteredMembers?.[1]?.workspaceMember.user.email || 'user@example.com',
            },
        ];

        const ws = XLSX.utils.json_to_sheet(templateData);

        // Set column widths
        ws['!cols'] = [
            { wch: 30 }, // Name
            { wch: 40 }, // Description
            { wch: 15 }, // Tag
            { wch: 15 }, // Start Date
            { wch: 10 }, // Days
            { wch: 35 }, // Assignee Email
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "SubTasks");

        // Add instructions sheet
        const instructions = [
            { 'Column': 'Name', 'Description': 'Required. The name of the subtask. Slug will be auto-generated from this.', 'Example': 'Install electrical wiring' },
            { 'Column': 'Description', 'Description': 'Optional. Detailed description', 'Example': 'Install all electrical wiring in the building' },
            { 'Column': 'Tag', 'Description': 'Required. Must be: DESIGN, PROCUREMENT, or CONTRACTOR', 'Example': 'CONTRACTOR' },
            { 'Column': 'Start Date', 'Description': 'Optional. Format: YYYY-MM-DD', 'Example': '2024-01-15' },
            { 'Column': 'Days', 'Description': 'Optional. Number of days', 'Example': '5' },
            { 'Column': 'Assignee Email', 'Description': 'Optional. Email address from Members sheet', 'Example': filteredMembers?.[0]?.workspaceMember.user.email || 'user@example.com' },
        ];
        const wsInstructions = XLSX.utils.json_to_sheet(instructions);
        wsInstructions['!cols'] = [{ wch: 18 }, { wch: 55 }, { wch: 35 }];
        XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

        // Add members reference sheet
        const membersData = filteredMembers?.map((member) => {
            const user = member.workspaceMember.user;
            return {
                'Name': `${user.name} ${user.surname || ''}`,
                'Email': user.email || '',
                'Role': member.projectRole,
            };
        }) || [];
        const wsMembers = XLSX.utils.json_to_sheet(membersData);
        wsMembers['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsMembers, "Members");

        XLSX.writeFile(wb, "subtasks_template.xlsx");
        toast.success("Template downloaded successfully!");
    };

    // Upload and Parse Excel File
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadedFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                if (jsonData.length === 0) {
                    toast.error("Excel file is empty!");
                    setUploadedFile(null);
                    return;
                }

                const parsedTasks: SubTaskInput[] = jsonData.map((row) => {
                    const name = row['Name'] || row['name'] || '';
                    // Auto-generate slug from name
                    const slug = slugify(name, { lower: true, strict: true });
                    const description = row['Description'] || row['description'] || '';
                    const tag = (row['Tag'] || row['tag'] || 'CONTRACTOR').toUpperCase();
                    const startDate = row['Start Date'] || row['startDate'] || row['start_date'] || '';
                    const days = parseInt(row['Days'] || row['days'] || '0') || 0;
                    const assigneeEmail = row['Assignee Email'] || row['assigneeEmail'] || row['assignee_email'] || row['Email'] || '';

                    // Find user ID by email
                    let assigneeId = '';
                    if (assigneeEmail) {
                        const member = filteredMembers?.find(
                            (m) => m.workspaceMember.user.email?.toLowerCase() === assigneeEmail.toLowerCase()
                        );
                        if (member) {
                            assigneeId = member.workspaceMember.user.id;
                        }
                    }

                    // Validate tag
                    const validTag = ['DESIGN', 'PROCUREMENT', 'CONTRACTOR'].includes(tag) ? tag : 'CONTRACTOR';

                    return {
                        name,
                        slug,
                        description,
                        tag: validTag as "DESIGN" | "PROCUREMENT" | "CONTRACTOR",
                        startDate: startDate ? formatDateForInput(startDate) : '',
                        days,
                        assignee: assigneeId,
                    };
                });

                // Handle duplicate slugs by appending numbers
                const slugCounts = new Map<string, number>();
                const uniqueParsedTasks = parsedTasks.map((task) => {
                    const baseSlug = task.slug;
                    const count = slugCounts.get(baseSlug) || 0;
                    slugCounts.set(baseSlug, count + 1);

                    // If this is a duplicate, append a number
                    if (count > 0) {
                        return {
                            ...task,
                            slug: `${baseSlug}-${count}`
                        };
                    }
                    return task;
                });

                setParsedData(uniqueParsedTasks);
                toast.success(`Loaded ${uniqueParsedTasks.length} tasks from Excel!`);
            } catch (error) {
                console.error("Error parsing Excel file:", error);
                toast.error("Failed to parse Excel file. Please check the format.");
                setUploadedFile(null);
            }
        };
        reader.readAsArrayBuffer(file);

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Helper function to format date
    const formatDateForInput = (dateValue: any): string => {
        if (!dateValue) return '';

        try {
            // Handle Excel serial date
            if (typeof dateValue === 'number') {
                const date = XLSX.SSF.parse_date_code(dateValue);
                return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
            }

            // Handle string date
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
        } catch (e) {
            console.error("Date parsing error:", e);
        }

        return '';
    };

    const handleSubmit = async () => {
        if (!parsedData || parsedData.length === 0) {
            toast.error("Please upload an Excel file first!");
            return;
        }

        // Filter out empty subtasks
        const validSubTasks = parsedData.filter((task) => task.name.trim() !== "");

        if (validSubTasks.length === 0) {
            toast.error("No valid tasks found in the Excel file!");
            return;
        }


        // Initialize progress
        setUploadProgress({
            total: validSubTasks.length,
            uploaded: 0,
            status: 'uploading',
            message: 'Preparing to upload...'
        });

        startTransition(async () => {
            // Simulate progress updates
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev.uploaded < prev.total - 1) {
                        return {
                            ...prev,
                            uploaded: prev.uploaded + 1,
                            message: `Uploading subtask ${prev.uploaded + 1} of ${prev.total}...`
                        };
                    }
                    return prev;
                });
            }, 100); // Update every 100ms

            const { data: result, error } = await tryCatch(
                bulkCreateSubTasks({
                    projectId,
                    parentTaskId,
                    subTasks: validSubTasks.map((t) => ({
                        name: t.name,
                        taskSlug: t.slug,
                        description: t.description,
                        tag: t.tag,
                        startDate: t.startDate,
                        days: t.days,
                        assignee: t.assignee,
                        status: "TO_DO",
                    })),
                })
            );

            clearInterval(progressInterval);

            if (error) {
                setUploadProgress({
                    total: validSubTasks.length,
                    uploaded: 0,
                    status: 'error',
                    message: error.message
                });
                toast.error(error.message);
                console.error(error);
                // Clear file input even on error
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
                return;
            }

            if (result.status === "success") {
                // Complete progress
                setUploadProgress({
                    total: validSubTasks.length,
                    uploaded: validSubTasks.length,
                    status: 'success',
                    message: `Successfully uploaded ${validSubTasks.length} subtasks!`
                });

                toast.success(result.message || `${validSubTasks.length} subtasks created successfully`);
                triggerConfetti();

                // Notify parent to add subtasks to state immediately
                if (onSubTaskCreated && result.data) {
                    onSubTaskCreated(result.data as any[]);
                }

                // Reset form after a delay to show success state
                setTimeout(() => {
                    setUploadedFile(null);
                    setParsedData([]);
                    setUploadProgress({
                        total: 0,
                        uploaded: 0,
                        status: 'idle',
                        message: ''
                    });
                    // Clear file input to allow re-uploading the same file
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                    setOpen(false);
                    router.refresh();
                }, 2000);
            } else {
                setUploadProgress({
                    total: validSubTasks.length,
                    uploaded: 0,
                    status: 'error',
                    message: result.message
                });
                toast.error(result.message);
                // Clear file input on error
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Bulk Upload
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" />
                        Bulk Upload Sub-Tasks via Excel
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                        <button
                            type="button"
                            onClick={downloadTemplate}
                            disabled={pending}
                            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="h-3 w-3" />
                            Download the template
                        </button>
                        , fill it with your subtasks, and upload it back. Slugs are auto-generated from names.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Upload Filled Excel */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5" />
                                Upload Filled Excel
                            </CardTitle>
                            <CardDescription>
                                Upload your completed Excel file with subtasks
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={pending}
                                className="w-full gap-2"
                            >
                                <FileSpreadsheet className="h-4 w-4" />
                                {uploadedFile ? 'Change Excel File' : 'Select Excel File'}
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileUpload}
                                className="hidden"
                            />

                            {uploadedFile && (
                                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                                            {uploadedFile.name}
                                        </p>
                                        <p className="text-xs text-green-700 dark:text-green-300">
                                            {parsedData.length} subtasks ready to upload
                                        </p>
                                    </div>
                                </div>
                            )}

                            {!uploadedFile && (
                                <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-xs text-blue-900 dark:text-blue-100">
                                            Supported formats: .xlsx, .xls
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Upload Progress */}
                    {uploadProgress.status !== 'idle' && (
                        <Card className={cn(
                            "border-2",
                            uploadProgress.status === 'uploading' && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/50",
                            uploadProgress.status === 'success' && "border-green-500 bg-green-50/50 dark:bg-green-950/50",
                            uploadProgress.status === 'error' && "border-red-500 bg-red-50/50 dark:bg-red-950/50"
                        )}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    {uploadProgress.status === 'uploading' && (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                            <span>Uploading...</span>
                                        </>
                                    )}
                                    {uploadProgress.status === 'success' && (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                            <span>Upload Complete!</span>
                                        </>
                                    )}
                                    {uploadProgress.status === 'error' && (
                                        <>
                                            <AlertCircle className="h-4 w-4 text-red-600" />
                                            <span>Upload Failed</span>
                                        </>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {/* Progress Bar */}
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Progress</span>
                                        <span className="font-medium">
                                            {uploadProgress.uploaded} / {uploadProgress.total} subtasks
                                        </span>
                                    </div>
                                    <Progress
                                        value={(uploadProgress.uploaded / uploadProgress.total) * 100}
                                        className="h-2"
                                    />
                                </div>

                                {/* Status Message */}
                                <p className={cn(
                                    "text-sm",
                                    uploadProgress.status === 'uploading' && "text-blue-700 dark:text-blue-300",
                                    uploadProgress.status === 'success' && "text-green-700 dark:text-green-300",
                                    uploadProgress.status === 'error' && "text-red-700 dark:text-red-300"
                                )}>
                                    {uploadProgress.message}
                                </p>

                                {/* Remaining Count */}
                                {uploadProgress.status === 'uploading' && (
                                    <p className="text-xs text-muted-foreground">
                                        {uploadProgress.total - uploadProgress.uploaded} subtasks remaining
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            setOpen(false);
                            setUploadedFile(null);
                            setParsedData([]);
                            // Clear file input when canceling
                            if (fileInputRef.current) {
                                fileInputRef.current.value = '';
                            }
                        }}
                        disabled={pending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={pending || !uploadedFile || parsedData.length === 0}
                        className="gap-2"
                    >
                        {pending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4" />
                                Upload {parsedData.length} SubTasks
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
