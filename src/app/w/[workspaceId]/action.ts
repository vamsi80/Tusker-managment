"use server";

import prisma from "@/lib/db"; // use the shared client
import { ApiResponse } from "@/lib/types";
import { projectSchema, ProjectSchemaType, editProjectSchema, EditProjectSchemaType } from "@/lib/zodSchemas";
import { requireUser } from "@/app/data/user/require-user";
import { ProjectRole } from "@/generated/prisma/client";

export async function createProject(values: ProjectSchemaType): Promise<ApiResponse> {
  const user = await requireUser();

  const validation = projectSchema.safeParse(values);
  if (!validation.success) {
    return {
      status: "error",
      message: "Please check the form details and try again.",
    };
  }

  if (!values?.workspaceId) {
    return {
      status: "error",
      message: "We couldn't identify the workspace. Please refresh the page and try again.",
    };
  }

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: values.workspaceId },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    if (!workspace) {
      return { status: "error", message: "The requested workspace could not be found." };
    }

    const workspaceMembers = workspace.members || [];

    if (workspaceMembers.length === 0) {
      return {
        status: "error",
        message: "This workspace doesn't have any members yet.",
      };
    }

    const currentMemberRecord = workspaceMembers.find(
      (m) => String(m.userId) === String(user.id)
    );

    if (!currentMemberRecord) {
      return {
        status: "error",
        message: "You must be a member of this workspace to create a project.",
      };
    }

    const isUserAdmin = currentMemberRecord.workspaceRole === "ADMIN";

    if (!isUserAdmin) {
      return {
        status: "error",
        message: "Only workspace admins can create projects.",
      };
    }

    const membersWithRoleMember = workspaceMembers.filter(
      (member) => member.workspaceRole === "MEMBER"
    );

    if (membersWithRoleMember.length < 2) {
      return {
        status: "error",
        message: "At least 2 members with the 'MEMBER' role are required to create a project.",
      };
    }

    // Normalize incoming arrays of IDs (strings)
    const incomingMemberAccess = Array.isArray(values.memberAccess) ? values.memberAccess.map(String) : [];
    const incomingProjectLeads = values.projectLead ? [String(values.projectLead)] : [];

    // Ensure memberAccess contains the current user (creator)
    if (!incomingMemberAccess || incomingMemberAccess.length === 0) {
      incomingMemberAccess.push(String(user.id));
    } else if (!incomingMemberAccess.includes(String(user.id))) {
      incomingMemberAccess.push(String(user.id));
    }

    // Default lead to admin (current user) if none provided
    if (!incomingProjectLeads || incomingProjectLeads.length === 0) {
      incomingProjectLeads.push(String(user.id));
    }

    // Ensure every lead is also in memberAccess
    for (const leadId of incomingProjectLeads) {
      if (!incomingMemberAccess.includes(leadId)) {
        incomingMemberAccess.push(leadId);
      }
    }

    // Deduplicate IDs
    const uniqueMemberAccess = Array.from(new Set(incomingMemberAccess)).map(String);
    const uniqueProjectLeads = Array.from(new Set(incomingProjectLeads)).map(String);

    // Build map userId -> workspaceMemberId for quick lookup
    const workspaceMemberMap = new Map<string, string>();
    for (const wm of workspaceMembers) {
      if (wm?.userId && wm?.id) workspaceMemberMap.set(String(wm.userId), String(wm.id));
    }

    // Build lead set for quick membership test
    const leadUserSet = new Set(uniqueProjectLeads);

    const mergedprojectMembersCreates = uniqueMemberAccess
      .map((userId) => {
        const wmId = workspaceMemberMap.get(String(userId));
        if (!wmId) {
          return null;
        }

        // Use relation connect for workspaceMember
        const accessRow: any = {
          workspaceMember: { connect: { id: wmId } },
          hasAccess: true,
        };

        if (leadUserSet.has(String(userId))) {
          accessRow.projectRole = "LEAD" as ProjectRole;
        }

        return accessRow;
      })
      .filter(Boolean) as Array<
        { workspaceMember: { connect: { id: string } }; hasAccess: boolean; projectRole?: ProjectRole }
      >;

    if (mergedprojectMembersCreates.length === 0) {
      return {
        status: "error",
        message: "We couldn't find the selected members in this workspace.",
      };
    }

    // Create project with nested create using relation connect form
    await prisma.$transaction([
      prisma.project.create({
        data: {
          name: validation.data.name,
          description: validation.data.description,
          slug: validation.data.slug,
          workspaceId: values.workspaceId,
          projectMembers: {
            create: mergedprojectMembersCreates,
          },
          clint: {
            create: {
              name: validation.data.companyName,
              registeredCompanyName: validation.data.registeredCompanyName,
              directorName: validation.data.directorName,
              address: validation.data.address,
              gstNumber: validation.data.gstNumber,
              clintMembers: {
                create: {
                  name: validation.data.contactPerson,
                  contactNumber: validation.data.contactNumber,
                },
              },
            },
          },
        },
      }),
    ]);

    // Invalidate project cache for all users in the workspace
    const { invalidateWorkspaceProjects } = await import("@/app/data/user/invalidate-project-cache");
    await invalidateWorkspaceProjects(values.workspaceId);

    return {
      status: "success",
      message: "Project created successfully! You can now start adding tasks.",
    };
  } catch (err) {
    console.error("Error creating project:", err);
    return {
      status: "error",
      message: "An unexpected error occurred while creating the project. Please try again later.",
    };
  }
}

export async function deleteProject(projectId: string): Promise<ApiResponse> {
  const user = await requireUser();

  try {
    // 1. Get the project and verify it exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!project) {
      return {
        status: "error",
        message: "Project not found.",
      };
    }

    // 2. Check if user is a workspace admin
    const workspaceMember = project.workspace.members.find(
      (m) => m.userId === user.id
    );

    if (!workspaceMember || workspaceMember.workspaceRole !== "ADMIN") {
      return {
        status: "error",
        message: "Only workspace admins can delete projects.",
      };
    }

    // 3. Delete the project (cascades to tasks, project members, etc.)
    await prisma.project.delete({
      where: { id: projectId },
    });

    // 4. Invalidate project cache
    const { invalidateWorkspaceProjects, invalidateProjectTasks } = await import(
      "@/app/data/user/invalidate-project-cache"
    );
    await invalidateWorkspaceProjects(project.workspaceId);
    await invalidateProjectTasks(projectId);

    return {
      status: "success",
      message: "Project deleted successfully.",
    };
  } catch (err) {
    console.error("Error deleting project:", err);
    return {
      status: "error",
      message: "An unexpected error occurred while deleting the project. Please try again later.",
    };
  }
}

export async function editProject(values: EditProjectSchemaType): Promise<ApiResponse> {
  const user = await requireUser();

  try {
    // Validate input
    const validation = editProjectSchema.safeParse(values);
    if (!validation.success) {
      return {
        status: "error",
        message: "Please check the form details and try again.",
      };
    }

    // 1. Get the project with all related data
    const project = await prisma.project.findUnique({
      where: { id: values.projectId },
      include: {
        workspace: {
          include: {
            members: true,
          },
        },
        clint: true,
        projectMembers: true,
      },
    });

    if (!project) {
      return {
        status: "error",
        message: "Project not found.",
      };
    }

    // 2. Check if user is a workspace admin
    const workspaceMember = project.workspace.members.find(
      (m) => m.userId === user.id
    );

    if (!workspaceMember || workspaceMember.workspaceRole !== "ADMIN") {
      return {
        status: "error",
        message: "Only workspace admins can edit projects.",
      };
    }

    // 3. Check if slug is unique (if slug is being changed)
    if (validation.data.slug && validation.data.slug !== project.slug) {
      const existingProject = await prisma.project.findFirst({
        where: {
          workspaceId: project.workspaceId,
          slug: validation.data.slug,
          id: { not: values.projectId },
        },
      });

      if (existingProject) {
        return {
          status: "error",
          message: "A project with this slug already exists in the workspace.",
        };
      }
    }

    // 4. Build workspace member map for member access updates
    const workspaceMemberMap = new Map<string, string>();
    for (const wm of project.workspace.members) {
      if (wm?.userId && wm?.id) {
        workspaceMemberMap.set(String(wm.userId), String(wm.id));
      }
    }

    // 5. Update project and client in a transaction
    await prisma.$transaction(async (tx) => {
      // Update project basic info
      await tx.project.update({
        where: { id: values.projectId },
        data: {
          name: validation.data.name,
          description: validation.data.description,
          slug: validation.data.slug || project.slug,
        },
      });

      // Update client info if provided and client exists
      const clientRecord = project.clint?.[0]; // clint is an array, get first one
      if (clientRecord) {
        await tx.clints.update({
          where: { id: clientRecord.id },
          data: {
            ...(validation.data.companyName && { name: validation.data.companyName }),
            ...(validation.data.registeredCompanyName && { registeredCompanyName: validation.data.registeredCompanyName }),
            ...(validation.data.directorName && { directorName: validation.data.directorName }),
            ...(validation.data.address && { address: validation.data.address }),
            ...(validation.data.gstNumber && { gstNumber: validation.data.gstNumber }),
          },
        });

        // Update client member contact info if provided
        if (validation.data.contactPerson || validation.data.contactNumber) {
          const clientMember = await tx.clintMembers.findFirst({
            where: { clintId: clientRecord.id },
          });

          if (clientMember) {
            await tx.clintMembers.update({
              where: { id: clientMember.id },
              data: {
                ...(validation.data.contactPerson && { name: validation.data.contactPerson }),
                ...(validation.data.contactNumber && { contactNumber: validation.data.contactNumber }),
              },
            });
          }
        }
      }

      // Update project members if memberAccess is provided
      if (validation.data.memberAccess && validation.data.memberAccess.length > 0) {
        const uniqueMemberAccess = Array.from(new Set(validation.data.memberAccess)).map(String);
        const uniqueProjectLeads = validation.data.projectLead
          ? [String(validation.data.projectLead)]
          : [];
        const leadUserSet = new Set(uniqueProjectLeads);

        // Remove existing project members
        await tx.projectMember.deleteMany({
          where: { projectId: values.projectId },
        });

        // Add new project members
        const newMembers = uniqueMemberAccess
          .map((userId) => {
            const wmId = workspaceMemberMap.get(String(userId));
            if (!wmId) return null;

            return {
              projectId: values.projectId,
              workspaceMemberId: wmId,
              hasAccess: true,
              projectRole: leadUserSet.has(String(userId)) ? ("LEAD" as ProjectRole) : ("MEMBER" as ProjectRole),
            };
          })
          .filter(Boolean) as Array<{
            projectId: string;
            workspaceMemberId: string;
            hasAccess: boolean;
            projectRole: ProjectRole;
          }>;

        if (newMembers.length > 0) {
          await tx.projectMember.createMany({
            data: newMembers,
          });
        }
      }
    });

    // 6. Invalidate project cache
    const { invalidateWorkspaceProjects } = await import(
      "@/app/data/user/invalidate-project-cache"
    );
    await invalidateWorkspaceProjects(project.workspaceId);

    return {
      status: "success",
      message: "Project updated successfully.",
    };
  } catch (err) {
    console.error("Error updating project:", err);
    return {
      status: "error",
      message: "An unexpected error occurred while updating the project. Please try again later.",
    };
  }
}

