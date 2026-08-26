"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Lock, RotateCcw, Search } from "lucide-react";
import {
    CAPABILITIES,
    WORKSPACE_ROLES,
    DEFAULT_CAPABILITIES,
    resolveCapabilities,
    type Capability,
    type CapabilityOverrides,
    type RoleOverrides,
} from "@/lib/constants/capabilities";
import type { WorkspaceRole } from "@/types/workspace";
import { updateRolePermission, updateMemberPermission } from "@/actions/permissions/update-permissions";

const ROLE_LABEL: Record<WorkspaceRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MANAGER: "Manager",
    PROCUREMENT: "Procurement",
    ACCOUNTS: "Accounts",
    MEMBER: "Member",
    VIEWER: "Viewer",
};

export interface MemberRow {
    id: string;
    role: WorkspaceRole;
    name: string;
    email: string | null;
    designation: string | null;
    overrides: CapabilityOverrides;
}

interface Props {
    workspaceId: string;
    viewerRole: WorkspaceRole;
    roleOverrides: RoleOverrides;
    members: MemberRow[];
}

export function PermissionsManager({ workspaceId, viewerRole, roleOverrides, members }: Props) {
    const [roles, setRoles] = useState<RoleOverrides>(roleOverrides);
    const [memberRows, setMemberRows] = useState<MemberRow[]>(members);
    const [query, setQuery] = useState("");
    const [isPending, startTransition] = useTransition();

    const effective = (role: WorkspaceRole, capability: Capability) =>
        resolveCapabilities(role, roles)[capability];

    // OWNER is immutable. An admin cannot edit the ADMIN row either, or they
    // could strip their own access to this page; only an owner can.
    const roleLocked = (role: WorkspaceRole) =>
        role === "OWNER" || (role === "ADMIN" && viewerRole === "ADMIN");

    const toggleRole = (role: WorkspaceRole, capability: Capability, next: boolean) => {
        const previous = roles;
        const isDefault = next === DEFAULT_CAPABILITIES[role][capability];
        const forRole = { ...(previous[role] ?? {}) };
        if (isDefault) delete forRole[capability];
        else forRole[capability] = next;

        const optimistic: RoleOverrides = { ...previous, [role]: forRole };
        if (!Object.keys(forRole).length) delete optimistic[role];
        setRoles(optimistic);

        startTransition(async () => {
            const result = await updateRolePermission({
                workspaceId,
                role,
                capability,
                value: isDefault ? null : next,
            });
            if (!result.success) {
                setRoles(previous);
                toast.error(result.error);
            }
        });
    };

    const toggleMember = (member: MemberRow, capability: Capability, next: boolean | null) => {
        const previous = memberRows;
        const overrides = { ...member.overrides };
        if (next === null) delete overrides[capability];
        else overrides[capability] = next;

        setMemberRows((rows) => rows.map((r) => (r.id === member.id ? { ...r, overrides } : r)));

        startTransition(async () => {
            const result = await updateMemberPermission({
                workspaceId,
                workspaceMemberId: member.id,
                capability,
                value: next,
            });
            if (!result.success) {
                setMemberRows(previous);
                toast.error(result.error);
            }
        });
    };

    const needle = query.trim().toLowerCase();
    const visibleMembers = needle
        ? memberRows.filter(
            (m) =>
                m.name.toLowerCase().includes(needle) ||
                (m.email ?? "").toLowerCase().includes(needle)
        )
        : memberRows;

    return (
        <div className={cn("space-y-6 pb-10", isPending && "opacity-90")}>
            {/* Role grid */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Role permissions</CardTitle>
                    <CardDescription>
                        Applies to every member with that role. These sit on top of project
                        roles — unchecking a box always removes access, but checking one does
                        not grant it to someone their project role already blocks.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] border-collapse text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                                        Capability
                                    </th>
                                    {WORKSPACE_ROLES.map((role) => (
                                        <th key={role} className="px-2 py-2 text-center font-medium">
                                            <span className="flex flex-col items-center gap-1">
                                                <span className="text-xs">{ROLE_LABEL[role]}</span>
                                                {roleLocked(role) && (
                                                    <Lock className="size-3 text-muted-foreground/60" />
                                                )}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {CAPABILITIES.map((capability) => (
                                    <tr key={capability.id} className="border-b last:border-0">
                                        <td className="py-2.5 pr-4">
                                            <span className="font-medium">{capability.label}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                {capability.group}
                                            </span>
                                        </td>
                                        {WORKSPACE_ROLES.map((role) => {
                                            const locked = roleLocked(role);
                                            const changed = roles[role]?.[capability.id] !== undefined;
                                            return (
                                                <td key={role} className="px-2 py-2.5 text-center">
                                                    <span className="inline-flex items-center justify-center">
                                                        <Checkbox
                                                            checked={effective(role, capability.id)}
                                                            disabled={locked || isPending}
                                                            aria-label={`${capability.label} for ${ROLE_LABEL[role]}`}
                                                            className={cn(changed && "ring-2 ring-primary/30")}
                                                            onCheckedChange={(value) =>
                                                                toggleRole(role, capability.id, value === true)
                                                            }
                                                        />
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Per-member exceptions */}
            <Card>
                <CardHeader className="gap-3">
                    <div>
                        <CardTitle className="text-base">Member exceptions</CardTitle>
                        <CardDescription>
                            Override the role grid for one person. Only members with an
                            exception differ from their role — everyone else follows the grid above.
                        </CardDescription>
                    </div>
                    <div className="relative max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search members..."
                            className="h-9 pl-8"
                        />
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {visibleMembers.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            No members match that search.
                        </p>
                    )}

                    {visibleMembers.map((member) => {
                        const locked =
                            member.role === "OWNER" ||
                            (member.role === "ADMIN" && viewerRole === "ADMIN");
                        const resolved = resolveCapabilities(member.role, roles, member.overrides);
                        const exceptionCount = Object.keys(member.overrides).length;

                        return (
                            <div
                                key={member.id}
                                className="rounded-lg border p-3 transition-colors hover:bg-muted/30"
                            >
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{member.name}</span>
                                    <Badge variant="secondary" className="text-[10px]">
                                        {ROLE_LABEL[member.role]}
                                    </Badge>
                                    {member.designation && (
                                        <span className="text-xs text-muted-foreground">
                                            {member.designation}
                                        </span>
                                    )}
                                    {locked && <Lock className="size-3 text-muted-foreground/60" />}
                                    {exceptionCount > 0 && !locked && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={isPending}
                                            className="ml-auto h-7 gap-1 text-xs"
                                            onClick={() =>
                                                Object.keys(member.overrides).forEach((c) =>
                                                    toggleMember(member, c as Capability, null)
                                                )
                                            }
                                        >
                                            <RotateCcw className="size-3" />
                                            Reset to {ROLE_LABEL[member.role]}
                                        </Button>
                                    )}
                                </div>

                                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {CAPABILITIES.map((capability) => {
                                        const overridden = member.overrides[capability.id] !== undefined;
                                        return (
                                            <label
                                                key={capability.id}
                                                className={cn(
                                                    "flex items-center gap-2 text-xs",
                                                    locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                                                )}
                                            >
                                                <Checkbox
                                                    checked={resolved[capability.id]}
                                                    disabled={locked || isPending}
                                                    className={cn(overridden && "ring-2 ring-primary/30")}
                                                    onCheckedChange={(value) => {
                                                        const next = value === true;
                                                        // Back to the role default? Drop the exception
                                                        // rather than pinning a value that now matches.
                                                        const roleValue = resolveCapabilities(member.role, roles)[
                                                            capability.id
                                                        ];
                                                        toggleMember(
                                                            member,
                                                            capability.id,
                                                            next === roleValue ? null : next
                                                        );
                                                    }}
                                                />
                                                <span>{capability.label}</span>
                                                {overridden && (
                                                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                                        exception
                                                    </Badge>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
}
