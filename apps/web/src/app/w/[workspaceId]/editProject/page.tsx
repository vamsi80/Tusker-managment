"use client";

import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2Icon, ChevronLeft, ArrowRight, Loader2, Pencil, Calendar, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function EditProjectSelectionPage() {
    const { workspaceId, data: layoutData, isLoading: isLayoutLoading } = useWorkspaceLayout();
    const projects = layoutData?.projects || [];
    const router = useRouter();

    if (isLayoutLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading projects...</p>
            </div>
        );
    }

    return (
        <div className="size-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Select Project to Edit</h1>
                    <p className="text-muted-foreground text-sm">Choose a project from the list below to edit its details and team assignments.</p>
                </div>

                <Button variant="outline" size="sm" asChild className="h-9 gap-2">
                    <Link href={`/w/${workspaceId}`}>
                        <ChevronLeft className="size-4" />
                        Back
                    </Link>
                </Button>
            </div>

            {projects.length === 0 ? (
                <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center">
                    <Building2Icon className="size-12 text-muted-foreground/50 mb-4" />
                    <CardTitle className="text-lg">No Projects Found</CardTitle>
                    <CardDescription className="mt-2 max-w-sm">
                        There are no projects created in this workspace yet.
                    </CardDescription>
                    <Button asChild className="mt-6">
                        <Link href={`/w/${workspaceId}/createProject`}>Create a Project</Link>
                    </Button>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projects.map((proj) => {
                        const canEdit = proj.canManageMembers;
                        return (
                            <Card 
                                key={proj.id} 
                                className={`transition-all duration-200 border group ${
                                    canEdit 
                                        ? "hover:border-primary/50 hover:shadow-md cursor-pointer" 
                                        : "opacity-75 border-muted bg-muted/20"
                                }`}
                                onClick={() => {
                                    if (canEdit) {
                                        router.push(`/w/${workspaceId}/editProject/${proj.id}`);
                                    }
                                }}
                            >
                                <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className="size-8 rounded-lg flex items-center justify-center text-white font-semibold shadow-sm"
                                            style={{ backgroundColor: proj.color || "#0F172A" }}
                                        >
                                            <Building2Icon className="size-4" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base group-hover:text-primary transition-colors">
                                                {proj.name}
                                            </CardTitle>
                                            <CardDescription className="text-xs font-mono truncate max-w-[200px]">
                                                {proj.slug}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Badge variant={canEdit ? "outline" : "secondary"} className="text-[10px]">
                                        {proj.projectRole ? proj.projectRole.replace('_', ' ') : "No Role"}
                                    </Badge>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-col gap-3 pt-2">
                                        {proj.projectManager && (
                                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                <span className="font-semibold text-foreground/80">Manager:</span>
                                                {proj.projectManager.surname}
                                            </div>
                                        )}
                                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                            <Calendar className="size-3.5" />
                                            <span>Created {new Date(proj.createdAt).toLocaleDateString()}</span>
                                        </div>

                                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-muted/50">
                                            {canEdit ? (
                                                <>
                                                    <span className="text-xs font-medium text-primary flex items-center gap-1">
                                                        <Pencil className="size-3" />
                                                        Manage Project
                                                    </span>
                                                    <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-1" />
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500 font-medium col-span-full">
                                                    <ShieldAlert className="size-3.5" />
                                                    <span>Admin or Manager access required</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
