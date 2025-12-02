"use server";

import prisma from "@/lib/db"; // use the shared client
import { ApiResponse } from "@/lib/types";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
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

    const mergedProjectAccessCreates = uniqueMemberAccess
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

    if (mergedProjectAccessCreates.length === 0) {
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
          projectAccess: {
            create: mergedProjectAccessCreates,
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
