import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { TaskStatus } from "@/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 });
    }

    const projectId = searchParams.getAll("projectId");
    const status = searchParams.getAll("status") as TaskStatus[];
    const assigneeId = searchParams.getAll("assigneeId");
    const tagId = searchParams.getAll("tagId");
    const search = searchParams.get("search");

    const tasks = await prisma.task.findMany({
      where: {
        workspaceId,
        ...(projectId.length > 0 && { projectId: { in: projectId } }),
        ...(status.length > 0 && { status: { in: status } }),
        ...(assigneeId.length > 0 && { assigneeId: { in: assigneeId } }),
        ...(tagId.length > 0 && { tagId: { in: tagId } }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } }
          ]
        }),
      },
      include: {
        assignee: {
            include: { workspaceMember: { include: { user: { select: { name: true, image: true } } } } }
        },
        tag: true,
        project: { select: { color: true, name: true } }
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, projectId } = body;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true }
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Attempt to get the project member for the user
    // In strict applications we'd ensure they are a member, but here we just find it.
    const projectMember = await prisma.projectMember.findFirst({
        where: { project: { id: projectId }, workspaceMember: { userId: user.id } }
    });

    const task = await prisma.task.create({
      data: {
        name,
        projectId,
        workspaceId: project.workspaceId,
        createdById: projectMember?.id || "",
        taskSlug: "T-" + Date.now().toString().slice(-6),
        isParent: true,
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) return NextResponse.json({ error: "Task ID required" }, { status: 400 });

    const body = await request.json();

    const task = await prisma.task.update({
      where: { id: taskId },
      data: body,
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
