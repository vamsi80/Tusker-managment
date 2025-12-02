"use client";

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
import { WorkspaceMemberRow } from "@/app/data/workspace/get-workspace-members";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface iAppProps {
    data: WorkspaceMemberRow[];
}

export const columns: ColumnDef<WorkspaceMemberRow>[] = [
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
    }
];

export function TeamMembers({ data }: iAppProps) {
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
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
    );
}
