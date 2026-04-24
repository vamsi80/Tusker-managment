"use client";

import { toast } from "sonner";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { WorkspaceData } from "@/types/workspace";
import { apiClient } from "@/lib/api-client";
import { updateWorkspaceInfoSchema, UpdateWorkspaceInfoType } from "@/lib/zodSchemas";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Trash2 } from "lucide-react";

interface WorkspaceInfoFormProps {
    workspace: WorkspaceData;
}

export function WorkspaceInfoForm({ workspace }: WorkspaceInfoFormProps) {
    const [isPending, setIsPending] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const form = useForm<UpdateWorkspaceInfoType>({
        resolver: zodResolver(updateWorkspaceInfoSchema),
        defaultValues: {
            workspaceId: workspace.id,
            name: workspace.name,
            description: workspace.description || "",
            legalName: workspace.legalName || "",
            gstNumber: workspace.gstNumber || "",
            panNumber: workspace.panNumber || "",
            companyType: workspace.companyType || "",
            industry: workspace.industry || "",
            msmeNumber: workspace.msmeNumber || "",
            email: workspace.email || "",
            phone: workspace.phone || "",
            website: workspace.website || "",
            addressLine1: workspace.addressLine1 || "",
            addressLine2: workspace.addressLine2 || "",
            city: workspace.city || "",
            state: workspace.state || "",
            country: workspace.country || "",
            pincode: workspace.pincode || "",
        },
    });

    const onSubmit = async (values: UpdateWorkspaceInfoType) => {
        setIsPending(true);
        try {
            const res = await apiClient.workspaces.update(values.workspaceId, values);
            if (res.status === "success") {
                toast.success(res.message);
                form.reset(values);
                router.refresh();
            } else {
                toast.error(res.message);
            }
        } catch (error) {
            toast.error("Something went wrong");
        } finally {
            setIsPending(false);
        }
    };

    const onDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await apiClient.workspaces.delete(workspace.id);
            if (res.status === "success") {
                toast.success(res.message);
                router.push("/dashboard");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        } catch (error) {
            toast.error("Failed to delete workspace");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight">Workspace Information</h1>
                        <p className="text-muted-foreground">
                            Update organizational and legal details for {workspace.name}.
                        </p>
                    </div>
                    <Button type="submit" disabled={isPending || !form.formState.isDirty}>
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Save Changes"
                        )}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* General & Legal Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Organization Details</CardTitle>
                            <CardDescription>Basic and legal information</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Workspace Name <span className="text-red-500">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="legalName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Legal Entity Name <span className="text-red-500">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="companyType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Company Type <span className="text-red-500">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} placeholder="e.g. Pvt Ltd" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="industry"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Industry <span className="text-red-500">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="msmeNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                MSME Number <span className="text-red-500">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="gstNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                GST Number <span className="text-red-500">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="panNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>PAN Number</FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ""} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    {/* Contact & Address */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Contact & Location</CardTitle>
                            <CardDescription>Address and communication details</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Email <span className="text-red-500">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} type="email" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Phone <span className="text-red-500">*</span>
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value || ""} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="website"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Website</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ""} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-4 pt-2">
                                <h4 className="text-sm font-medium text-muted-foreground">Address</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="addressLine1"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Line 1 <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={field.value || ""} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="addressLine2"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Line 2</FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={field.value || ""} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="city"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    City <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={field.value || ""} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="state"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    State <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={field.value || ""} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="pincode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Pincode <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={field.value || ""} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="country"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    Country <span className="text-red-500">*</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={field.value || ""} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>

            <div className="mt-12 space-y-6">
                <Separator />
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-5 w-5" />
                        <h3 className="text-xl font-bold tracking-tight">Danger Zone</h3>
                    </div>
                    
                    <Card className="border-destructive/20 bg-destructive/5">
                        <CardHeader>
                            <CardTitle className="text-destructive">Delete Workspace</CardTitle>
                            <CardDescription>
                                Once you delete a workspace, there is no going back. This will permanently 
                                delete the workspace and all its associated data (projects, tasks, members).
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" className="w-full sm:w-auto">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete this workspace
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete the
                                            <span className="font-bold text-foreground mx-1">{workspace.name}</span>
                                            workspace and remove all associated data from our servers.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                                        <AlertDialogAction 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                onDelete();
                                            }}
                                            disabled={isDeleting}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            {isDeleting ? "Deleting..." : "Permanently Delete"}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </Form>
    );
}
