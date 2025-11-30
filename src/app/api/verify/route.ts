// /app/api/verify/route.ts
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const role = searchParams.get("role");

    if (!workspaceId || !role) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Check if user already exists in workspace
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId,
        },
      },
    });

    if (!existingMember) {
      // Add user to workspace
      await prisma.workspaceMember.create({
        data: {
          workspaceId,
          userId: session.user.id,
          WorkspaceRole: role as "ADMIN" | "MEMBER" | "VIEWER",
        },
      });
    }

    // Redirect to workspace
    return NextResponse.redirect(new URL(`/w/${workspaceId}`, req.url));
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.redirect(new URL("/error", req.url));
  }
}
