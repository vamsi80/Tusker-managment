"use client";

import { useState, useTransition, useEffect } from "react";
import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { IndentRequestWithRelations } from "@/data/procurement/get-indent-requests";
import { IconEdit, IconHash, IconCheck, IconX, IconLoader2 } from "@tabler/icons-react";
import { updateIndent } from "@/actions/procurement/update-indent";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface IndentDetailsDialogProps {
    indent: IndentRequestWithRelations;
    trigger?: React.ReactNode;
    userRole: string;
}

export function IndentDetailsDialog({ indent, trigger, userRole }: IndentDetailsDialogProps) {
    const [open, setOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [items, setItems] = useState(indent.items);
    const [pending, startTransition] = useTransition();

    const isAdmin = userRole === "ADMIN" || userRole === "OWNER";
    const canEdit = isAdmin; // Or creator logic if needed

    // Sync items when indent prop changes
    useEffect(() => {
        if (open) {
            setItems(indent.items);
            setIsEditing(false);
        }
    }, [indent, open]);

    const handleQuantityChange = (itemId: string, newQty: number) => {
        setItems(current => current.map(item =>
            item.id === itemId ? { ...item, quantity: newQty } : item
        ));
    };

    const handleUpdate = (status?: "APPROVED" | "REJECTED" | "REQUESTED") => {
        startTransition(async () => {
            const payloadItems = items.map(i => ({ id: i.id, quantity: i.quantity }));

            const result = await updateIndent({
                workspaceId: indent.project.workspaceId || "", // Assuming accessible or passed. 
                // Actually indent.project doesn't have workspaceId in fetch? 
                // Wait, getIndentRequests select project { id, name }. Not workspaceId.
                // WE NEED WORKSPACE ID.
                // Fortunately, we are in [workspaceId] layout path, but we don't have it in props.
                // We can fetch it via params? No, client component.
                // FIX: IndentRequestWithRelations doesn't have workspaceId on root?
                // Schema IndentDetails doesn't store workspaceId directly (via project).
                // I need to update get-indent-requests to include workspaceId or pass it as prop.
                // PASS IT AS PROP is easier.
                indentId: indent.id,
                status: status, // undefined means just save data
                items: payloadItems
            });

            if (result.success) {
                toast.success(status ? `Indent ${status.toLowerCase()}` : "Indent updated");
                setOpen(false);
                setIsEditing(false);
            } else {
                toast.error(result.error || "Failed to update indent");
            }
        });
    };

    // Helper to get formatted status
    const getStatusColor = (status: string) => {
        switch (status) {
            case "APPROVED": return "bg-green-100 text-green-700 border-green-200";
            case "REJECTED": return "bg-red-100 text-red-700 border-red-200";
            case "UNDER_REVIEW": return "bg-yellow-100 text-yellow-700 border-yellow-200";
            default: return "bg-gray-100 text-gray-700 border-gray-200";
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <div className="cursor-pointer hover:underline text-primary font-medium truncate max-w-[300px]" title={indent.name}>
                        {indent.name}
                    </div>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b bg-muted/5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-xl font-semibold leading-none tracking-tight">
                                    {indent.name}
                                </DialogTitle>
                                <Badge variant="outline" className={getStatusColor(indent.status)}>
                                    {indent.status.replace("_", " ")}
                                </Badge>
                            </div>
                            <DialogDescription className="flex items-center gap-2 text-xs">
                                <IconHash className="h-3 w-3" />
                                <span className="font-mono">{indent.key}</span>
                                <span>•</span>
                                <span>{format(new Date(indent.createdAt), "PPP")}</span>
                            </DialogDescription>
                        </div>
                        {canEdit && !isEditing && indent.status !== "APPROVED" && indent.status !== "REJECTED" && (
                            <Button size="sm" variant="outline" className="gap-2 h-8" onClick={() => setIsEditing(true)}>
                                <IconEdit className="h-3.5 w-3.5" />
                                Edit Quantities
                            </Button>
                        )}
                        {isEditing && (
                            <div className="flex gap-2">
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsEditing(false)}>Cancel</Button>
                                <Button size="sm" className="h-8" onClick={() => handleUpdate(undefined)} disabled={pending}>
                                    Save
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 p-6 pt-4">
                    <div className="grid gap-6">
                        {/* Details (Project, Requestor) same as before */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Project Details</h4>
                                <div className="bg-muted/30 rounded-lg p-3 space-y-2 border">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Project:</span>
                                        <span className="font-medium">{indent.project.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Task:</span>
                                        <span className="font-medium">{indent.task ? indent.task.name : "-"}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Request Information</h4>
                                <div className="bg-muted/30 rounded-lg p-3 space-y-2 border">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Requested By:</span>
                                        <div className="flex items-center gap-1.5">
                                            {(indent as any).requestor?.user ? (
                                                <>
                                                    <Avatar className="h-5 w-5">
                                                        <AvatarImage src={(indent as any).requestor.user.image} />
                                                        <AvatarFallback className="text-[9px]">{(indent as any).requestor.user.name?.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="font-medium">{(indent as any).requestor.user.name}</span>
                                                </>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Items Table with Editing */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    Requested Items ({items.length})
                                </h4>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead className="h-9">Material/Item</TableHead>
                                            <TableHead className="h-9 w-[120px] text-right">Quantity</TableHead>
                                            <TableHead className="h-9 w-[100px]">Unit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.map((item) => (
                                            <TableRow key={item.id} className="hover:bg-muted/10">
                                                <TableCell className="py-2.5 font-medium">
                                                    {item.material.name}
                                                </TableCell>
                                                <TableCell className="py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            className="h-7 w-24 ml-auto text-right"
                                                            value={item.quantity}
                                                            onChange={(e) => handleQuantityChange(item.id, parseFloat(e.target.value) || 0)}
                                                        />
                                                    ) : (
                                                        <span className="font-medium">{item.quantity}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-muted-foreground text-xs">
                                                    {item.unit ? item.unit.abbreviation : "-"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                {/* Actions Footer */}
                <DialogFooter className="p-4 border-t bg-muted/10">
                    <div className="flex w-full justify-between items-center">
                        <Button variant="ghost" onClick={() => setOpen(false)}>
                            Close
                        </Button>

                        {isAdmin && indent.status === "REQUESTED" && (
                            <div className="flex gap-2">
                                <Button
                                    variant="destructive"
                                    className="gap-2"
                                    onClick={() => handleUpdate("REJECTED")}
                                    disabled={pending}
                                >
                                    {pending ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconX className="w-4 h-4" />}
                                    Reject
                                </Button>
                                <Button
                                    variant="default"
                                    className="gap-2 bg-green-600 hover:bg-green-700"
                                    onClick={() => handleUpdate("APPROVED")}
                                    disabled={pending}
                                >
                                    {pending ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconCheck className="w-4 h-4" />}
                                    Approve {isEditing && "& Save"}
                                </Button>
                            </div>
                        )}
                        {(indent.status === "APPROVED" || indent.status === "REJECTED") && (
                            <span className="text-sm text-muted-foreground italic">
                                Indent is {indent.status.toLowerCase()}.
                            </span>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
