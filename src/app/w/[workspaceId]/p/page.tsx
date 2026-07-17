"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useWorkspaceLayout } from "../_components/workspace-layout-context";
import { 
  Building2, 
  Plus, 
  Search, 
  ArrowRight, 
  Calendar, 
  FolderKanban
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const roleLabels: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PROJECT_MANAGER: { 
    label: "Project Manager", 
    color: "text-blue-700 dark:text-blue-300", 
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-900/60"
  },
  PROJECT_COORDINATOR: { 
    label: "Coordinator", 
    color: "text-purple-700 dark:text-purple-300", 
    bg: "bg-purple-50 dark:bg-purple-950/40",
    border: "border-purple-200 dark:border-purple-900/60"
  },
  LEAD: { 
    label: "Lead", 
    color: "text-amber-700 dark:text-amber-300", 
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-900/60"
  },
  MEMBER: { 
    label: "Member", 
    color: "text-emerald-700 dark:text-emerald-300", 
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-900/60"
  },
  VIEWER: { 
    label: "Viewer", 
    color: "text-zinc-700 dark:text-zinc-300", 
    bg: "bg-zinc-50 dark:bg-zinc-950/40",
    border: "border-zinc-200 dark:border-zinc-800"
  },
};

const getRoleDetails = (proj: any, isWorkspaceAdmin: boolean) => {
  const role = proj.projectRole;
  if (role && roleLabels[role]) return roleLabels[role];
  if (isWorkspaceAdmin) {
    return {
      label: "Admin",
      color: "text-rose-700 dark:text-rose-300",
      bg: "bg-rose-50 dark:bg-rose-950/40",
      border: "border-rose-200 dark:border-rose-900/60"
    };
  }
  return {
    label: "Access Enabled",
    color: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-50 dark:bg-slate-900/40",
    border: "border-slate-200 dark:border-slate-800"
  };
};

export default function WorkspaceProjectsPage() {
  const { data: layoutData, workspaceId, isLoading } = useWorkspaceLayout();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilters, setSelectedRoleFilters] = useState<string[]>([]);

  const projects = layoutData.projects || [];
  const isWorkspaceAdmin = layoutData.permissions?.isWorkspaceAdmin || false;
  const canCreateProject = layoutData.permissions?.canCreateProject || false;

  const rolesAvailable = useMemo(() => {
    const roles = new Set<string>();
    projects.forEach((p: any) => {
      if (p.projectRole) roles.add(p.projectRole);
    });
    return Array.from(roles);
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((proj: any) => {
      const matchesSearch = proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (proj.description && proj.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole = selectedRoleFilters.length === 0 ||
        selectedRoleFilters.includes(proj.projectRole);

      return matchesSearch && matchesRole;
    });
  }, [projects, searchQuery, selectedRoleFilters]);

  if (isLoading) {
    return (
      <div className="space-y-8 px-2 py-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="h-5 w-72 rounded-md" />
          </div>
          <Skeleton className="h-11 w-36 rounded-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 px-2 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Projects</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-primary/10 text-primary rounded-full">
              {projects.length} Total
            </span>
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            Manage, coordinate, and view your projects and role-based tasks.
          </p>
        </div>

        {canCreateProject && (
          <Link
            href={`/w/${workspaceId}/createProject`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 hover:shadow-lg hover:shadow-primary/10 transition-all font-bold text-sm shrink-0 active:scale-95 cursor-pointer"
          >
            <Plus className="size-4 stroke-[2.5px]" />
            New Project
          </Link>
        )}
      </div>

      {/* Filter and Search Row */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card/45 hover:bg-card/85 focus:bg-card border border-border/80 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl text-sm font-medium outline-none transition-all placeholder:text-muted-foreground/50 shadow-sm"
          />
        </div>

        {/* Custom Tab Filters */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/40 self-start md:self-auto overflow-x-auto scrollbar-none max-w-full">
          <button
            onClick={() => setSelectedRoleFilters([])}
            className={cn(
              "px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap",
              selectedRoleFilters.length === 0
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground/80 hover:text-foreground"
            )}
          >
            All
          </button>
          
          {rolesAvailable.map((role) => {
            const label = roleLabels[role]?.label || role;
            return (
              <button
                key={role}
                onClick={() => setSelectedRoleFilters((current) =>
                  current.includes(role)
                    ? current.filter((item) => item !== role)
                    : [...current, role]
                )}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap",
                  selectedRoleFilters.includes(role)
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground/80 hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Projects */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-xl border border-dashed border-border bg-card/25 gap-3">
          <div className="p-4 bg-muted/50 rounded-lg text-muted-foreground/60">
            <FolderKanban className="size-8 stroke-[1.5px]" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No projects found</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            We couldn't find any projects matching your current filters. Try adjusting your search query or role filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((proj: any) => {
            const roleDetails = getRoleDetails(proj, isWorkspaceAdmin);
            const projectColor = proj.color || "#3b82f6"; // Fallback blue

            return (
              <Link
                key={proj.id}
                href={`/w/${workspaceId}/p/${proj.slug}`}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-card/65 hover:bg-card hover:shadow-md hover:shadow-border/5 transition-all duration-200 gap-4 overflow-hidden border-l-4"
                style={{ borderLeftColor: projectColor }}
              >
                {/* Left Section: Icon and Details */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div 
                    className="p-2.5 rounded-lg flex items-center justify-center text-white shadow-sm transition-transform duration-200 group-hover:scale-105 shrink-0"
                    style={{ backgroundColor: projectColor }}
                  >
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-foreground tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {proj.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/75 font-medium mt-0.5">
                      <Calendar className="size-3.5" />
                      <span>
                        Created {new Date(proj.createdAt || Date.now()).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Section: Role and CTA */}
                <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-border/40">
                  <div className="flex items-center">
                    <span className={cn(
                      "px-3 py-1 text-xs font-extrabold rounded-full border shadow-sm transition-all",
                      roleDetails.bg,
                      roleDetails.color,
                      roleDetails.border
                    )}>
                      {roleDetails.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="hidden md:inline text-xs text-muted-foreground/60 font-semibold group-hover:text-foreground transition-colors">
                      View tasks
                    </span>
                    <div
                      className="flex items-center justify-center p-2 rounded-lg bg-muted/65 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 group-hover:translate-x-1"
                    >
                      <ArrowRight className="size-4 stroke-[2px]" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
