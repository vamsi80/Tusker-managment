"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useMounted } from "@/hooks/use-mounted";
import { Skeleton } from "@/components/ui/skeleton";
import type { FullProjectData } from "@/types/project";
import { projectsClient } from "@/lib/api-client/projects";
import { EditProjectForm } from "./options/edit-project-form";
import type { WorkspaceMembersResult } from "@/types/workspace";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import { deleteProject } from "@/actions/project/delete-project";
import { ManageProjectMembersDialog } from "./options/manage-members-dialog";
import { CreateProjectForm } from "@/app/w/[workspaceId]/p/_components/create-project-form";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { Building2Icon, MoreHorizontal, Eye, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuAction, useSidebar } from "@/components/ui/sidebar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, } from "@/components/ui/alert-dialog";

interface iAppProps {
  workspaceId: string;
  isAdmin: boolean;
  canCreateProject?: boolean;
  userRole?: string;
  currentUserId?: string;
}

export function NavProjects({ workspaceId, isAdmin, canCreateProject, userRole, currentUserId }: iAppProps) {
  const { data: layoutData, isLoading: isLayoutLoading, isRevalidating, revalidate } = useWorkspaceLayout();
  const projects = layoutData.projects || [];

  // Keep isInitialLoading for skeleton logic if context is loading
  const isInitialLoading = (isLayoutLoading && projects.length === 0) || isRevalidating;

  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useSafeNavigation();
  const navigatingTo = useRef<string | null>(null);
  const mounted = useMounted();

  // Clear navigating ref when transition ends or path changes
  useEffect(() => {
    if (!router.isNavigating) {
      navigatingTo.current = null;
    }
  }, [router.isNavigating, pathname]);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.preventDefault();
    // 1. Block if already navigating globally OR if target is already being loaded locally
    // 2. Block if already on the target URL (pathname check)
    if (router.isNavigating || pathname === url || navigatingTo.current === url) return;

    if (isMobile) {
      setOpenMobile(false);
    }

    navigatingTo.current = url;
    router.push(url);
  };

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<FullProjectData | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  // Manage members dialog state
  const [manageMembersDialogOpen, setManageMembersDialogOpen] = useState(false);
  const [projectToManageMembers, setProjectToManageMembers] = useState<FullProjectData | null>(null);

  // Members list (loaded on demand)
  const [members, setMembers] = useState<WorkspaceMembersResult["workspaceMembers"]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const loadMembers = async () => {
    if (members.length > 0 || isLoadingMembers) return;
    setIsLoadingMembers(true);
    try {
      const result = await projectsClient.getWorkspaceMembers(workspaceId);
      if (result) {
        setMembers(result as any);
      } else {
        toast.error("Failed to load workspace members");
      }
    } catch (error) {
      console.error("Error loading members:", error);
      toast.error("An error occurred while loading members");
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleDeleteClick = (project: { id: string; name: string }) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleEditClick = async (projectId: string) => {
    if (isLoadingProject) return;
    setIsLoadingProject(true);
    try {
      const [fullData, membersResult] = await Promise.all([
        projectsClient.getFullData(projectId),
        loadMembers()
      ]);

      if (fullData) {
        setProjectToEdit(fullData);
        setEditDialogOpen(true);
      } else {
        toast.error("Failed to load project data");
      }
    } catch (error) {
      console.error("Error loading project:", error);
      toast.error("Failed to load project data");
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleManageMembersClick = async (projectId: string) => {
    if (isLoadingProject) return;
    setIsLoadingProject(true);
    try {
      const [fullData, membersResult] = await Promise.all([
        projectsClient.getFullData(projectId),
        loadMembers()
      ]);

      if (fullData) {
        setProjectToManageMembers(fullData);
        setManageMembersDialogOpen(true);
      } else {
        toast.error("Failed to load project data");
      }
    } catch (error) {
      console.error("Error loading project:", error);
      toast.error("Failed to load project data");
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      const result = await deleteProject(projectToDelete.id);

      if (result.status === "success") {
        toast.success(result.message);
        setDeleteDialogOpen(false);
        setProjectToDelete(null);
        revalidate(true);
        router.push(`/w/${workspaceId}`);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  const onOpenCreateProject = async () => {
    await loadMembers();
  };

  if (!mounted || isInitialLoading) {
    return <NavProjectsSkeleton />;
  }

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>
          <div className="flex text-sm items-center justify-between w-full cursor-pointer mb-4" onClick={onOpenCreateProject}>
            <span>Projects</span>
            {mounted && (
              <CreateProjectForm
                members={members}
                workspaceId={workspaceId}
                isAdmin={isAdmin} // Still used?
                canCreateProject={canCreateProject ?? isAdmin} // Fallback to isAdmin if undefined
                userRole={userRole}
                currentUserId={currentUserId}
              />
            )}
          </div>
        </SidebarGroupLabel>
        <SidebarMenu className="max-h-[40vh] overflow-y-auto custom-scrollbar px-1">
          {projects?.map((proj: any) => {
            const href = `/w/${workspaceId}/p/${proj.slug}`;
            const isActive = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <SidebarMenuItem key={proj.id}>
                <SidebarMenuButton asChild disabled={router.isNavigating}>
                  <Link
                    href={href}
                    prefetch={false}
                    onClick={(e) => handleLinkClick(e, href)}
                    className={
                      isActive
                        ? "bg-foreground/10 dark:bg-foreground/20 border-foreground/50 hover:bg-foreground/20 dark:hover:bg-foreground/30 text-foreground hover:text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    <Building2Icon style={{ color: proj.color || "currentColor" }} />
                    <span className="truncate">{proj.name}</span>
                  </Link>
                </SidebarMenuButton>

                {/* Action dropdown menu */}
                {mounted && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction>
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">More options</span>
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-48">
                      {/* View */}
                      <DropdownMenuItem asChild>
                        <Link href={href} className="flex items-center gap-2 cursor-pointer">
                          <Eye className="h-4 w-4" />
                          <span>View Project</span>
                        </Link>
                      </DropdownMenuItem>

                      {/* Edit - PROJECT_MANAGER or Admin */}
                      {proj.canManageMembers && (
                        <DropdownMenuItem
                          className="flex items-center gap-2 cursor-pointer"
                          disabled={isLoadingProject}
                          onClick={() => handleEditClick(proj.id)}
                        >
                          {isLoadingProject ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Pencil className="h-4 w-4" />
                          )}
                          <span>{isLoadingProject ? "Loading..." : "Edit Project"}</span>
                        </DropdownMenuItem>
                      )}

                      {/* Manage Members - PROJECT_MANAGER or Admin */}
                      {proj.canManageMembers && (
                        <DropdownMenuItem
                          className="flex items-center gap-2 cursor-pointer"
                          disabled={isLoadingProject}
                          onClick={() => handleManageMembersClick(proj.id)}
                        >
                          {isLoadingProject ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                          <span>{isLoadingProject ? "Loading..." : "Manage Members"}</span>
                        </DropdownMenuItem>
                      )}

                      {proj.canManageMembers && (
                        <>
                          <DropdownMenuSeparator />

                          {/* Delete - PROJECT_MANAGER or Admin */}
                          <DropdownMenuItem
                            className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => handleDeleteClick({ id: proj.id, name: proj.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete Project</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>

      {/* Edit Project Form Dialog */}
      {projectToEdit && (
        <EditProjectForm
          project={projectToEdit}
          members={members}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setProjectToEdit(null);
          }}
        />
      )}

      {/* Manage Members Dialog */}
      {projectToManageMembers && (
        <ManageProjectMembersDialog
          open={manageMembersDialogOpen}
          onOpenChange={(open) => {
            setManageMembersDialogOpen(open);
            if (!open) setProjectToManageMembers(null);
          }}
          projectId={projectToManageMembers.id}
          projectName={projectToManageMembers.name}
          currentMembers={
            projectToManageMembers.projectMembers?.map((pm) => ({
              id: pm.id,
              userId: pm.userId,
              userName: pm.userName || "Unknown",
              projectRole: pm.projectRole,
            })) || []
          }
          workspaceMembers={members}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{projectToDelete?.name}</span>? This action
              cannot be undone. All tasks and data associated with this project will be
              permanently deleted.
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
                  Deleting...
                </>
              ) : (
                "Delete Project"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NavProjectsSkeleton() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        <Skeleton className="h-4 w-20 bg-sidebar-border/50" />
      </SidebarGroupLabel>
      <SidebarMenu>
        {[1, 2, 3, 4].map((i) => (
          <SidebarMenuItem key={i}>
            <div className="flex h-9 w-full items-center gap-2 px-2">
              <Skeleton className="h-4 w-4 rounded-full bg-sidebar-border/50" />
              <Skeleton className="h-4 flex-1 bg-sidebar-border/50" />
            </div>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
