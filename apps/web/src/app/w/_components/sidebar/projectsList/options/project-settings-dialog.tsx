"use client";

import { useEffect, useState, useTransition } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, RotateCcw } from "lucide-react";
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
import type { ProjectRole } from "@tusker/db";

interface MemberRow {
    projectMemberId: string;
    projectRole: ProjectRole;
    name: string;
    email: string | null;
    locked: boolean;
    overrides: ProjectPermissionOverrides;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    projectId: string;
    projectName: string;
}

export function ProjectSettingsDialog({
    open,
    onOpenChange,
    workspaceId,
    projectId,
    projectName,
}: Props) {
    const [isLoading, setIsLoading] = useState(false);
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
    const [savedSettings, setSavedSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setIsLoading(true);
        projectsClient
            .getSettings(workspaceId, projectId)
            .then((data) => {
                if (cancelled || !data) return;
                setMembers(data.members ?? []);
                setSettings(data.settings ?? DEFAULT_PROJECT_SETTINGS);
                setSavedSettings(data.settings ?? DEFAULT_PROJECT_SETTINGS);
            })
            .catch(() => {
                if (!cancelled) toast.error("Failed to load project settings");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, workspaceId, projectId]);

    const resolved = (member: MemberRow) =>
        resolveProjectPermissions(member.projectRole, member.overrides);

    /** Optimistic per-checkbox write with rollback — there is no save button here. */
    const toggle = (member: MemberRow, permission: ProjectPermissionId, next: boolean) => {
        const previous = members;
        // Back to the role default? Drop the override rather than pinning a value
        // that already matches, so the row stays sparse.
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
                toast.success("Project defaults saved");
            } catch (error: any) {
                toast.error(error?.message || "Failed to save project defaults");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Project settings — {projectName}</DialogTitle>
                    <DialogDescription>
                        Tick a box to grant that person the action on this project, untick it to
                        take it away. Members still only act on tasks they created or are assigned
                        to; a workspace-wide permission that has been revoked in Settings →
                        Permissions still wins over anything ticked here.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Loading...
                    </div>
                ) : (
                    <div className={cn("flex-1 overflow-y-auto space-y-6", isPending && "opacity-90")}>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] border-collapse text-sm">
                                <thead className="sticky top-0 bg-background z-10">
                                    <tr className="border-b">
                                        <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                                            Member
                                        </th>
                                        {PROJECT_PERMISSIONS.map((p) => (
                                            <th key={p.id} className="px-2 py-2 text-center font-medium">
                                                <span className="text-[11px] leading-tight block">{p.label}</span>
                                            </th>
                                        ))}
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={PROJECT_PERMISSIONS.length + 2}
                                                className="py-8 text-center text-muted-foreground"
                                            >
                                                This project has no members yet.
                                            </td>
                                        </tr>
                                    )}
                                    {members.map((member) => {
                                        const effective = resolved(member);
                                        const overrideCount = Object.keys(member.overrides).length;
                                        return (
                                            <tr key={member.projectMemberId} className="border-b last:border-0">
                                                <td className="py-2.5 pr-4">
                                                    <span className="flex flex-wrap items-center gap-2">
                                                        <span className="font-medium">{member.name}</span>
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            {getProjectRoleDisplayName(member.projectRole)}
                                                        </Badge>
                                                        {member.locked && (
                                                            <Lock className="size-3 text-muted-foreground/60" />
                                                        )}
                                                    </span>
                                                </td>
                                                {PROJECT_PERMISSIONS.map((p) => {
                                                    const overridden = member.overrides[p.id] !== undefined;
                                                    return (
                                                        <td key={p.id} className="px-2 py-2.5 text-center">
                                                            <span className="inline-flex items-center justify-center">
                                                                <Checkbox
                                                                    checked={member.locked || effective[p.id]}
                                                                    disabled={member.locked || isPending}
                                                                    aria-label={`${p.label} for ${member.name}`}
                                                                    className={cn(overridden && "ring-2 ring-primary/30")}
                                                                    onCheckedChange={(value) =>
                                                                        toggle(member, p.id, value === true)
                                                                    }
                                                                />
                                                            </span>
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-1 text-center">
                                                    {overrideCount > 0 && !member.locked && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={isPending}
                                                            className="h-7 px-1"
                                                            title={`Reset to ${getProjectRoleDisplayName(member.projectRole)}`}
                                                            onClick={() => resetRow(member)}
                                                        >
                                                            <RotateCcw className="size-3" />
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                            <div>
                                <h3 className="text-sm font-medium">Project defaults</h3>
                                <p className="text-xs text-muted-foreground">
                                    Applies to every status change on this project that already asks
                                    for an explanation. With both off, a comment or an attachment
                                    satisfies it — the rule as it stands today.
                                </p>
                            </div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                    checked={settings.mandatoryComment}
                                    disabled={isPending}
                                    onCheckedChange={(value) =>
                                        setSettings((s) => ({ ...s, mandatoryComment: value === true }))
                                    }
                                />
                                <span>Always require a comment</span>
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                    checked={settings.mandatoryAttachment}
                                    disabled={isPending}
                                    onCheckedChange={(value) =>
                                        setSettings((s) => ({ ...s, mandatoryAttachment: value === true }))
                                    }
                                />
                                <span>Always require an attachment</span>
                            </label>
                            <Button
                                size="sm"
                                disabled={!settingsChanged || isPending}
                                onClick={saveSettings}
                            >
                                {isPending && <Loader2 className="mr-2 size-3 animate-spin" />}
                                Save defaults
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
