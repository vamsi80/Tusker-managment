import prisma from "./src/client";
import { broadcastTeamUpdate, broadcastTaskUpdate } from "../core/src/lib/realtime";
import crypto from "crypto";

async function main() {
  const workspaceId = "846e17c7-d85f-4453-9ca0-0acc7bfce49c"; // TuskerLane
  const testEmail = "alex.test@thewhitetusker.com";
  const testName = "Alex Rivera (Test Member)";

  console.log(`[Seed] Setting up test member in workspace ${workspaceId}...`);

  // 1. Upsert User
  let user = await prisma.user.findUnique({
    where: { email: testEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: testName,
        email: testEmail,
        surname: "Rivera",
        role: "USER",
      },
    });
    console.log(`[Seed] Created User: ${user.id} (${user.email})`);
  } else {
    console.log(`[Seed] Found existing User: ${user.id} (${user.email})`);
  }

  // 2. Upsert WorkspaceMember
  let workspaceMember = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId,
      },
    },
  });

  if (!workspaceMember) {
    workspaceMember = await prisma.workspaceMember.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        workspaceId,
        workspaceRole: "MEMBER",
        designation: "QA & Systems Tester",
        deactivatedAt: null,
      },
    });
    console.log(`[Seed] Created WorkspaceMember: ${workspaceMember.id}`);
  } else if (workspaceMember.deactivatedAt) {
    // If previously deactivated, reactivate for new test run
    workspaceMember = await prisma.workspaceMember.update({
      where: { id: workspaceMember.id },
      data: { deactivatedAt: null },
    });
    console.log(`[Seed] Reactivated existing WorkspaceMember: ${workspaceMember.id}`);
  } else {
    console.log(`[Seed] Found active WorkspaceMember: ${workspaceMember.id}`);
  }

  // 3. Find target projects
  const whiteTuskerProject = await prisma.project.findFirst({
    where: { workspaceId, slug: "white-tusker-office" },
  });
  const techHubProject = await prisma.project.findFirst({
    where: { workspaceId, slug: "tech-hub" },
  });

  if (!whiteTuskerProject || !techHubProject) {
    throw new Error("Could not find required target projects (white-tusker-office or tech-hub).");
  }

  // 4. Ensure ProjectMember in White Tusker Office
  let pmWhiteTusker = await prisma.projectMember.findUnique({
    where: {
      workspaceMemberId_projectId: {
        workspaceMemberId: workspaceMember.id,
        projectId: whiteTuskerProject.id,
      },
    },
  });

  if (!pmWhiteTusker) {
    pmWhiteTusker = await prisma.projectMember.create({
      data: {
        id: crypto.randomUUID(),
        projectId: whiteTuskerProject.id,
        workspaceMemberId: workspaceMember.id,
        hasAccess: true,
        projectRole: "MEMBER",
      },
    });
    console.log(`[Seed] Added to Project "White Tusker Office": ${pmWhiteTusker.id}`);
  }

  // 5. Ensure ProjectMember in Tech Hub
  let pmTechHub = await prisma.projectMember.findUnique({
    where: {
      workspaceMemberId_projectId: {
        workspaceMemberId: workspaceMember.id,
        projectId: techHubProject.id,
      },
    },
  });

  if (!pmTechHub) {
    pmTechHub = await prisma.projectMember.create({
      data: {
        id: crypto.randomUUID(),
        projectId: techHubProject.id,
        workspaceMemberId: workspaceMember.id,
        hasAccess: true,
        projectRole: "MEMBER",
      },
    });
    console.log(`[Seed] Added to Project "Tech Hub": ${pmTechHub.id}`);
  }

  // 6. Find a collaborator in White Tusker Office (e.g. Digital or owner)
  const collaborator = await prisma.projectMember.findFirst({
    where: {
      projectId: whiteTuskerProject.id,
      workspaceMemberId: { not: workspaceMember.id },
      workspaceMember: { deactivatedAt: null },
    },
    include: {
      workspaceMember: { include: { user: true } },
    },
  });

  if (!collaborator) {
    throw new Error("Could not find a collaborator ProjectMember in White Tusker Office");
  }
  console.log(`[Seed] Collaborator selected: ${collaborator.workspaceMember.user.name} (${collaborator.id})`);

  // 7. Create diverse temporary tasks
  const timestamp = Date.now().toString().slice(-5);
  const tasksToCreate = [
    {
      name: `[TEMP TEST] Feature Verification - Assignee Only #${timestamp}`,
      description: "Temporary task assigned to Alex Rivera to verify assignee handover in Remove Member dialog.",
      status: "IN_PROGRESS" as const,
      projectId: whiteTuskerProject.id,
      assigneeId: pmWhiteTusker.id,
      reviewerId: collaborator.id,
      createdById: collaborator.id,
      taskSlug: `test-assignee-only-${timestamp}`,
      dueDate: new Date(Date.now() + 3 * 86400000),
    },
    {
      name: `[TEMP TEST] Security Audit - Reviewer Only #${timestamp}`,
      description: "Temporary task where Alex Rivera is reviewer to test reviewer handover in Remove Member dialog.",
      status: "REVIEW" as const,
      projectId: whiteTuskerProject.id,
      assigneeId: collaborator.id,
      reviewerId: pmWhiteTusker.id,
      createdById: collaborator.id,
      taskSlug: `test-reviewer-only-${timestamp}`,
      dueDate: new Date(Date.now() + 2 * 86400000),
    },
    {
      name: `[TEMP TEST] Process Checklist - Collision Test (Both Assignee & Reviewer) #${timestamp}`,
      description: "Temporary task where Alex Rivera is BOTH assignee and reviewer. Tests the collision / vacate option in Remove Member dialog.",
      status: "TO_DO" as const,
      projectId: whiteTuskerProject.id,
      assigneeId: pmWhiteTusker.id,
      reviewerId: pmWhiteTusker.id,
      createdById: pmWhiteTusker.id,
      taskSlug: `test-collision-both-${timestamp}`,
      dueDate: new Date(Date.now() + 4 * 86400000),
    },
    {
      name: `[TEMP TEST] Pipeline Setup - Cross-Project Handover #${timestamp}`,
      description: "Temporary task in Tech Hub assigned to Alex Rivera. Tests assigning to a member who needs to join the project.",
      status: "IN_PROGRESS" as const,
      projectId: techHubProject.id,
      assigneeId: pmTechHub.id,
      reviewerId: null,
      createdById: pmTechHub.id,
      taskSlug: `test-cross-project-${timestamp}`,
      dueDate: new Date(Date.now() + 5 * 86400000),
    },
  ];

  const createdTasks = [];
  for (const t of tasksToCreate) {
    const task = await prisma.task.create({
      data: {
        workspaceId,
        projectId: t.projectId,
        name: t.name,
        description: t.description,
        status: t.status,
        assigneeId: t.assigneeId,
        reviewerId: t.reviewerId,
        createdById: t.createdById,
        taskSlug: t.taskSlug,
        dueDate: t.dueDate,
        isParent: true,
      },
    });
    createdTasks.push(task);
    console.log(`[Seed] Created Task: "${task.name}" (${task.id})`);

    // Broadcast realtime task create
    try {
      await broadcastTaskUpdate({
        workspaceId,
        type: "CREATE",
        taskId: task.id,
        projectId: t.projectId,
      });
    } catch (err) {
      // safe ignore in seed
    }
  }

  // 8. Broadcast team update so UI refreshes in real-time
  try {
    await broadcastTeamUpdate({
      workspaceId,
      type: "CREATE",
      payload: { memberId: workspaceMember.id, userId: user.id },
    });
    console.log("[Seed] Broadcasted TEAM_UPDATE via Pusher.");
  } catch (err) {
    console.warn("[Seed] Pusher broadcast skipped or failed:", err);
  }

  console.log("\n==================== SUMMARY ====================");
  console.log(`Test Member Name: ${testName}`);
  console.log(`Test Member Email: ${testEmail}`);
  console.log(`Workspace Member ID: ${workspaceMember.id}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Tasks Created: ${createdTasks.length}`);
  createdTasks.forEach((t, i) => {
    console.log(`  ${i + 1}. [${t.status}] ${t.name} (ID: ${t.id})`);
  });
  console.log("=================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
