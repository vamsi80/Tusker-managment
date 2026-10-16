"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Info, Loader2, Lock, RotateCcw, Save, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { projectsClient } from "@tusker/api-client/projects";
import {
    PROJECT_PERMISSIONS,
    DEFAULT_PROJECT_PERMISSIONS,
    DEFAULT_PROJECT_SETTINGS,
    resolveProjectPermissions,
    type ProjectPermissionId,
    type ProjectPermissionOverrides,
    type ProjectSettings,
} from "@tusker/core/lib/constants/project-permissions";
import { getProjectRoleDisplayName } from "@tusker/core/lib/constants/project-access";
import { getColorFromString } from "@tusker/core/lib/colors/project-colors";
import type { ProjectRole } from "@tusker/db";

/** Consecutive permissions sharing a group, for the grouped header row. */
const PERMISSION_GROUPS = PROJECT_PERMISSIONS.reduce<{ group: string; count: number }[]>((groups, p) => {
    const last = groups[groups.length - 1];
    if (last?.group === p.group) last.count++;
    else groups.push({ group: p.group, count: 1 });
    return groups;
}, []);

interface MemberRow {
    projectMemberId: string;
    projectRole: ProjectRole;
    name: string;
    email: string | null;
    locked: boolean;
    overrides: ProjectPermissionOverrides;
}

export default function ProjectSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params.workspaceId as string;
    const projectId = params.projectId as string;

    const [isLoading, setIsLoading] = useState(true);
    const [projectName, setProjectName] = useState("");
    const [projectSlug, setProjectSlug] = useState("");
    const [projectColor, setProjectColor] = useState<string | null>(null);
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
    const [savedSettings, setSavedSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        projectsClient
            .getSettings(workspaceId, projectId)
            .then((data) => {
                if (cancelled || !data) return;
                setProjectName(data.projectName ?? "");
                setProjectSlug(data.projectSlug ?? "");
                setProjectColor(data.projectColor ?? null);
                setMembers(data.members ?? []);
                setSettings(data.settings ?? DEFAULT_PROJECT_SETTINGS);
                setSavedSettings(data.settings ?? DEFAULT_PROJECT_SETTINGS);
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error("Failed to load project settings:", error);
                    toast.error(error?.message || "Failed to load project settings");
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [workspaceId, projectId]);

    const resolved = (member: MemberRow) =>
        resolveProjectPermissions(member.projectRole, member.overrides);

    /** Optimistic per-checkbox write with rollback */
    const toggle = (member: MemberRow, permission: ProjectPermissionId, next: boolean) => {
        const previous = members;
        const isDefault = next === DEFAULT_PROJECT_PERMISSIONS[member.projectRole][permission];
        const overrides = { ...member.overrides };
        if (isDefault) delete overrides[permission];
        else overrides[permission] = next;

        setMembers((rows) =>
            rows.map((r) => (r.projectMemberId === member.projectMemberId ? { ...r, overrides } : r)),
        );

        startTransition(async () => {
            try {
                await projectsClient.updateSettings(workspaceId, projectId, {
                    member: {
                        projectMemberId: member.projectMemberId,
                        permission,
                        value: isDefault ? null : next,
                    },
                });
            } catch (error: any) {
                setMembers(previous);
                toast.error(error?.message || "Failed to update permission");
            }
        });
    };

    const resetRow = (member: MemberRow) => {
        const previous = members;
        setMembers((rows) =>
            rows.map((r) => (r.projectMemberId === member.projectMemberId ? { ...r, overrides: {} } : r)),
        );
        startTransition(async () => {
            try {
                for (const permission of Object.keys(member.overrides) as ProjectPermissionId[]) {
                    await projectsClient.updateSettings(workspaceId, projectId, {
                        member: { projectMemberId: member.projectMemberId, permission, value: null },
                    });
                }
                toast.success(`Reset overrides for ${member.name}`);
            } catch (error: any) {
                setMembers(previous);
                toast.error(error?.message || "Failed to reset permissions");
            }
        });
    };

    const settingsChanged =
        settings.mandatoryComment !== savedSettings.mandatoryComment ||
        settings.mandatoryAttachment !== savedSettings.mandatoryAttachment;

    const saveSettings = () => {
        startTransition(async () => {
            try {
                await projectsClient.updateSettings(workspaceId, projectId, { settings });
                setSavedSettings(settings);
                toast.success("Project defaults saved successfully");
            } catch (error: any) {
                toast.error(error?.message || "Failed to save project defaults");
            }
        });
    };

    const filteredMembers = members.filter((m) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            m.name.toLowerCase().includes(query) ||
            (m.email && m.email.toLowerCase().includes(query)) ||
            getProjectRoleDisplayName(m.projectRole).toLowerCase().includes(query)
        );
    });

    const backUrl = projectSlug ? `/w/${workspaceId}/p/${projectSlug}` : `/w/${workspaceId}`;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Loading project settings...</p>
            </div>
        );
    }

    return (
        <div className="size-full overflow-y-auto space-y-6 w-full pt-4 sm:pt-6 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                <div className="flex items-center gap-3">
                    <div
                        className="size-7 shrink-0 rounded-full shadow-inner border transition-colors"
                        style={{ backgroundColor: projectColor || getColorFromString(projectName) }}
                    />
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">Project Settings</h1>
                            <Badge variant="outline" className="font-normal text-xs">
                                {projectName}
                            </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                            Manage per-member permission matrix and project-wide defaults.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild className="h-9 gap-1.5">
                        <Link href={backUrl}>
                            <ChevronLeft className="size-4" />
                            Back to Project
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Permission Matrix Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                <SlidersHorizontal className="size-4 text-primary" />
                                Member Permission Matrix
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                                Choose what each person can do in this project. Hover a column name to see exactly
                                what it allows.
                            </CardDescription>
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Filter members..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 pl-8 text-xs"
                            />
                        </div>
                    </div>
                    <div className="mt-3 grid gap-x-6 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-2">
                        <p>
                            <span className="font-medium text-foreground">Ticked</span> means allowed in this project.
                            Each person starts with their role&apos;s defaults: Project Manager, Coordinator and Lead have
                            everything; a Member can change the status of their own tasks; a Viewer can only look.
                        </p>
                        <p>
                            <span className="font-medium text-foreground">A ringed box</span> has been changed from the
                            role default. Use <RotateCcw className="inline size-3 align-[-2px]" /> at the end of a row to
                            put that person back to their role&apos;s defaults.
                        </p>
                        <p>
                            <Lock className="inline size-3 align-[-2px]" />{" "}
                            <span className="font-medium text-foreground">Workspace owners and admins</span> can always do
                            everything, so their rows can&apos;t be changed. Anything turned off for someone&apos;s role in
                            workspace Settings → Permissions stays off here too, even if ticked.
                        </p>
                        <p>
                            <span className="font-medium text-foreground">Always true, whatever is ticked:</span> nobody can
                            complete, hold or cancel a task assigned to themselves, nobody can change the dates of a task
                            assigned to themselves, and only PMs, owners and admins can reopen a completed task.
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] border-collapse text-sm">
                            <thead className="bg-muted/40 border-y">
                                <tr className="border-b border-border/60">
                                    <th rowSpan={2} className="py-2.5 px-4 text-left font-medium text-xs text-muted-foreground uppercase tracking-wider w-[240px] align-bottom">
                                        Member
                                    </th>
                                    {PERMISSION_GROUPS.map(({ group, count }) => (
                                        <th
                                            key={group}
                                            colSpan={count}
                                            className="px-2 pt-2 pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 border-l border-border/60"
                                        >
                                            {group}
                                        </th>
                                    ))}
                                    <th rowSpan={2} className="w-10 px-2" />
                                </tr>
                                <tr>
                                    {PROJECT_PERMISSIONS.map((p) => (
                                        <th key={p.id} className="px-2 py-2 text-center font-medium text-xs text-muted-foreground align-top">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                                                    >
                                                        {p.label}
                                                        <Info className="size-3 shrink-0 opacity-60" aria-hidden />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="bottom" className="max-w-64 text-xs leading-relaxed">
                                                    {p.description}
                                                </TooltipContent>
                                            </Tooltip>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {filteredMembers.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={PROJECT_PERMISSIONS.length + 2}
                                            className="py-12 text-center text-muted-foreground text-sm"
                                        >
                                            {searchQuery ? "No members match your filter." : "This project has no members yet."}
                                        </td>
                                    </tr>
                                )}
                                {filteredMembers.map((member) => {
                                    const effective = resolved(member);
                                    const overrideCount = Object.keys(member.overrides).length;
                                    return (
                                        <tr key={member.projectMemberId} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-foreground">{member.name}</span>
                                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                            {getProjectRoleDisplayName(member.projectRole)}
                                                        </Badge>
                                                        {member.locked && (
                                                            <span title="Workspace owners & admins cannot be restricted per project">
                                                                <Lock className="size-3 text-muted-foreground/60" />
                                                            </span>
                                                        )}
                                                    </div>
                                                    {member.email && (
                                                        <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                                            {member.email}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {PROJECT_PERMISSIONS.map((p) => {
                                                const overridden = member.overrides[p.id] !== undefined;
                                                const allowed = member.locked || effective[p.id];
                                                const roleName = getProjectRoleDisplayName(member.projectRole);
                                                const state = member.locked
                                                    ? "always allowed for workspace owners and admins"
                                                    : `${allowed ? "allowed" : "not allowed"} (${overridden ? `changed from the ${roleName} default` : `${roleName} default`})`;
                                                return (
                                                    <td key={p.id} className="px-2 py-3 text-center">
                                                        <span
                                                            className="inline-flex items-center justify-center"
                                                            title={`${p.label} for ${member.name}: ${state}`}
                                                        >
                                                            <Checkbox
                                                                checked={member.locked || effective[p.id]}
                                                                disabled={member.locked || isPending}
                                                                aria-label={`${p.label} for ${member.name}`}
                                                                className={cn(overridden && "ring-2 ring-primary/40")}
                                                                onCheckedChange={(value) =>
                                                                    toggle(member, p.id, value === true)
                                                                }
                                                            />
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 text-center">
                                                {overrideCount > 0 && !member.locked && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={isPending}
                                                        className="size-7 p-0 text-muted-foreground hover:text-foreground"
                                                        title={`Reset to role defaults (${getProjectRoleDisplayName(member.projectRole)})`}
                                                        onClick={() => resetRow(member)}
                                                    >
                                                        <RotateCcw className="size-3.5" />
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Project Defaults Card */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold">Status Change Evidence</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                        Some status changes ask the person to explain themselves: sending a task to Review, putting it
                        On Hold or Cancelling it, reopening a Completed, On Hold or Cancelled task, and moving a task back
                        from Review or In Progress. Choose what they must provide for those changes in this project. With
                        both boxes off, either a comment or an attachment is enough.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer">
                            <Checkbox
                                checked={settings.mandatoryComment}
                                disabled={isPending}
                                className="mt-0.5"
                                onCheckedChange={(value) =>
                                    setSettings((s) => ({ ...s, mandatoryComment: value === true }))
                                }
                            />
                            <div className="space-y-0.5">
                                <span className="text-sm font-medium text-foreground block">Always require comment</span>
                                <span className="text-xs text-muted-foreground block">
                                    A written comment is required for those status changes, even if a file is attached.
                                </span>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer">
                            <Checkbox
                                checked={settings.mandatoryAttachment}
                                disabled={isPending}
                                className="mt-0.5"
                                onCheckedChange={(value) =>
                                    setSettings((s) => ({ ...s, mandatoryAttachment: value === true }))
                                }
                            />
                            <div className="space-y-0.5">
                                <span className="text-sm font-medium text-foreground block">Always require attachment</span>
                                <span className="text-xs text-muted-foreground block">
                                    A file (photo, document or link) is required for those status changes, even if a
                                    comment is written.
                                </span>
                            </div>
                        </label>
                    </div>

                    <div className="flex items-center justify-end pt-2">
                        <Button
                            disabled={!settingsChanged || isPending}
                            onClick={saveSettings}
                            className="gap-2"
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="size-4" />
                                    Save Defaults
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
