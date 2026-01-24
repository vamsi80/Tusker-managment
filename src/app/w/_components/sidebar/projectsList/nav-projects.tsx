"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import { EditProjectForm } from "./options/edit-project-form";
import { ManageProjectMembersDialog } from "./options/manage-members-dialog";
import { usePathname, useRouter } from "next/navigation";
import { deleteProject } from "@/actions/project/delete-project";
import { UserProjectsType } from "@/data/project/get-projects";
import { WorkspaceMembersType } from "@/data/workspace/get-workspace-members";
import { CreateProjectForm } from "../../../[workspaceId]/p/_components/create-project-form";
import { Building2Icon, MoreHorizontal, Eye, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { getFullProjectData, FullProjectData } from "@/data/project/get-full-project-data";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuAction, useSidebar } from "@/components/ui/sidebar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, } from "@/components/ui/alert-dialog";

interface iAppProps {
  projects: UserProjectsType;
  members: WorkspaceMembersType;
  workspaceId: string;
  isAdmin: boolean;
}

export function NavProjects({ projects, members, workspaceId, isAdmin }: iAppProps) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

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

  const handleDeleteClick = (project: { id: string; name: string }) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleEditClick = async (projectId: string) => {
    setIsLoadingProject(true);
    try {
      const fullProjectData = await getFullProjectData(projectId);
      if (fullProjectData) {
        setProjectToEdit(fullProjectData);
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
    setIsLoadingProject(true);
    try {
      const fullProjectData = await getFullProjectData(projectId);
      if (fullProjectData) {
        setProjectToManageMembers(fullProjectData);
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
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteProject(projectToDelete.id);

      if (result.status === "success") {
        toast.success(result.message);
        setDeleteDialogOpen(false);
        setProjectToDelete(null);
        // Redirect to workspace page after deletion
        router.push(`/w/${workspaceId}`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>
          <div className="flex text-sm items-center justify-between w-full cursor-pointer mb-4">
            <span>Projects</span>
            <CreateProjectForm
              members={members}
              workspaceId={workspaceId}
              isAdmin={isAdmin}
            />
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          {projects?.map((proj) => {
            const href = `/w/${workspaceId}/p/${proj.slug}`;
            const isActive = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <SidebarMenuItem key={proj.id}>
                <SidebarMenuButton asChild>
                  <Link
                    href={href}
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

                    {/* Edit - Admin only */}
                    {isAdmin && (
                      <>
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

                        {/* Manage Members - Admin only */}
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

                        <DropdownMenuSeparator />

                        {/* Delete - Admin only */}
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
              hasAccess: pm.hasAccess,
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
