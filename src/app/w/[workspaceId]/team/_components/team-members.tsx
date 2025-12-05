"use client";

import { useState } from "react";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WorkspaceMemberRow } from "@/app/data/workspace/get-workspace-members";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MoreHorizontal, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteWorkspaceMember } from "../actions";

interface iAppProps {
    data: WorkspaceMemberRow[];
    isAdmin: boolean;
    workspaceId: string;
}

// Create columns dynamically to access isAdmin
const createColumns = (
    isAdmin: boolean,
    onViewMember: (member: WorkspaceMemberRow) => void,
    onEditMember: (member: WorkspaceMemberRow) => void,
    onDeleteMember: (member: WorkspaceMemberRow) => void
): ColumnDef<WorkspaceMemberRow>[] => [
        {
            accessorKey: "user.name",
            header: "Name",
            cell: ({ row }) => {
                const user = row.original.user;
                const name = user?.name || " ";
                const fullName = `${name}`;
                const email = user?.email;
                const image = user?.image || "";

                return (
                    <div className="flex items-center gap-3 ml-2">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={image} alt={fullName} />
                            <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium">{fullName}</span>
                            <span className="text-xs text-muted-foreground">{email}</span>
                        </div>
                    </div>
                );
            },
        },
        {
            accessorKey: "user.surname",
            header: "Surname",
            cell: ({ row }) => {
                const user = row.original.user;
                const surname = user?.surname || " ";
                return <div>{surname}</div>;
            },
        },
        {
            accessorKey: "workspaceRole",
            header: "Role",
            cell: ({ row }) => {
                const workspaceRole = row.original.workspaceRole || " ";
                return <div>{workspaceRole}</div>;
            },
        },
        {
            accessorKey: "user.contactNumber",
            header: "Contact Number",
            cell: ({ row }) => {
                const user = row.original.user;
                const contactNumber = user?.contactNumber || " ";
                return <div>{contactNumber}</div>;
            },
        },
        {
            id: "status",
            header: "Status",
            cell: () => {
                return (
                    <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
                        Active
                    </div>
                )
            }
        },
        {
            id: "actions",
            header: "",
            cell: ({ row }) => {
                const member = row.original;

                return (
                    <div className="flex justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                    className="flex items-center gap-2 cursor-pointer"
                                    onClick={() => onViewMember(member)}
                                >
                                    <Eye className="h-4 w-4" />
                                    <span>View Member</span>
                                </DropdownMenuItem>

                                {isAdmin && (
                                    <>
                                        <DropdownMenuItem
                                            className="flex items-center gap-2 cursor-pointer"
                                            onClick={() => onEditMember(member)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                            <span>Edit Member</span>
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator />

                                        <DropdownMenuItem
                                            className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                                            onClick={() => onDeleteMember(member)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            <span>Remove Member</span>
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];

export function TeamMembers({ data, isAdmin, workspaceId }: iAppProps) {
    const router = useRouter();

    // View member dialog state
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [memberToView, setMemberToView] = useState<WorkspaceMemberRow | null>(null);

    // Edit member state (placeholder - can be expanded)
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [memberToEdit, setMemberToEdit] = useState<WorkspaceMemberRow | null>(null);

    // Delete member state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [memberToDelete, setMemberToDelete] = useState<WorkspaceMemberRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleViewMember = (member: WorkspaceMemberRow) => {
        setMemberToView(member);
        setViewDialogOpen(true);
    };

    const handleEditMember = (member: WorkspaceMemberRow) => {
        setMemberToEdit(member);
        setEditDialogOpen(true);
        // TODO: Implement edit member functionality
        toast.info("Edit member functionality coming soon!");
    };

    const handleDeleteMember = (member: WorkspaceMemberRow) => {
        setMemberToDelete(member);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!memberToDelete) return;

        setIsDeleting(true);
        try {
            const result = await deleteWorkspaceMember(memberToDelete.id, workspaceId);

            if (result.status === "success") {
                toast.success(result.message);
                setDeleteDialogOpen(false);
                setMemberToDelete(null);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error("Failed to remove member");
        } finally {
            setIsDeleting(false);
        }
    };

    const columns = createColumns(
        isAdmin,
        handleViewMember,
        handleEditMember,
        handleDeleteMember
    );

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <>
            <div className="rounded-md border">
                <Table>
                    <TableHeader >
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* View Member Dialog */}
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Member Details</DialogTitle>
                    </DialogHeader>
                    {memberToView && (
                        <div className="space-y-4 py-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage
                                        src={memberToView.user?.image || ""}
                                        alt={memberToView.user?.name || ""}
                                    />
                                    <AvatarFallback className="text-xl">
                                        {memberToView.user?.name?.charAt(0) || "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-lg font-semibold">
                                        {memberToView.user?.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {memberToView.user?.email}
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-3">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Surname:</span>
                                    <span className="font-medium">
                                        {memberToView.user?.surname || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Role:</span>
                                    <span className="font-medium">
                                        {memberToView.workspaceRole}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Contact:</span>
                                    <span className="font-medium">
                                        {memberToView.user?.contactNumber || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status:</span>
                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary text-primary-foreground">
                                        Active
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Member</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove{" "}
                            <span className="font-semibold">
                                {memberToDelete?.user?.name}
                            </span>{" "}
                            from this workspace? They will lose access to all projects
                            and tasks in this workspace.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                "Remove Member"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

