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
      message: "Invalid form data",
    };
  }

  if (!values?.workspaceId) {
    return {
      status: "error",
      message: "Invalid workspace id",
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
      return { status: "error", message: "Workspace not found" };
    }

    const workspaceMembers = workspace.members || [];

    if (workspaceMembers.length === 0) {
      return {
        status: "error",
        message: "No workspace members found for this workspace.",
      };
    }

    const currentMemberRecord = workspaceMembers.find(
      (m) => String(m.userId) === String(user.id)
    );

    if (!currentMemberRecord) {
      return {
        status: "error",
        message: "Unauthorized to create project in this workspace. (not a workspace member)",
      };
    }

    const isUserAdmin = currentMemberRecord.workspaceRole === "ADMIN";

    if (!isUserAdmin) {
      return {
        status: "error",
        message: "Unauthorized to create project in this workspace.",
      };
    }

    // Normalize incoming arrays of IDs (strings)
    const incomingMemberAccess = Array.isArray(values.memberAccess) ? values.memberAccess.map(String) : [];
    const incomingProjectLeads = Array.isArray(values.projectLead) ? values.projectLead.map(String) : [];

    // Ensure memberAccess contains the current user
    if (!incomingMemberAccess || incomingMemberAccess.length === 0) {
      incomingMemberAccess.push(String(user.id));
    } else if (!incomingMemberAccess.includes(String(user.id))) {
      incomingMemberAccess.push(String(user.id));
    }

    // Default lead to admin if none provided
    if (!incomingProjectLeads || incomingProjectLeads.length === 0) {
      incomingProjectLeads.push(String(user.id));
      console.log("👑 Auto-assigned admin as project lead:", user.id);
    }

    // Ensure every lead is also in memberAccess
    for (const leadId of incomingProjectLeads) {
      if (!incomingMemberAccess.includes(leadId)) {
        incomingMemberAccess.push(leadId);
      }
    }

    // Deduplicate
    const uniqueMemberAccess = Array.from(new Set(incomingMemberAccess)).map(String);
    const uniqueProjectLeads = Array.from(new Set(incomingProjectLeads)).map(String);

    // Build map userId -> workspaceMemberId
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
          console.warn("⚠️ Skipping userId (not a workspace member):", userId);
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
      console.log("❌ No valid workspace members found for provided memberAccess");
      return {
        status: "error",
        message: "No valid workspace members found for the provided memberAccess list.",
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

    console.log("✅ Project created successfully");

    return {
      status: "success",
      message: "Project created successfully",
    };
  } catch (err) {
    console.error("❌ createProject Error:", err);
    return {
      status: "error",
      message: "Something went wrong while creating the project.",
    };
  }
}
