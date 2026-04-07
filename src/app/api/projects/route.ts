import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required" }, { status: 400 });
    }

    const projects = await prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, workspaceId, projectManagerUserId, color, ...rest } = body;

    const project = await prisma.project.create({
      data: {
        name,
        workspaceId,
        createdBy: user.id,
        color: color || "#3b82f6",
        slug: name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now().toString().slice(-4),
      }
    });

    if (projectManagerUserId) {
        await prisma.projectMember.create({
            data: {
                projectId: project.id,
                workspaceMemberId: projectManagerUserId,
                projectRole: 'PROJECT_MANAGER',
                hasAccess: true,
            }
        });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
