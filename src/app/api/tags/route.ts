import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });

    const tags = await prisma.tag.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, workspaceId, requirePurchase } = body;

    const tag = await prisma.tag.create({
      data: { name, workspaceId, requirePurchase: requirePurchase || false },
    });

    return NextResponse.json({ tag });
  } catch (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { tagId, workspaceId, ...data } = body;

    const tag = await prisma.tag.update({
      where: { id: tagId },
      data,
    });

    return NextResponse.json({ tag });
  } catch (error) {
    console.error("Error updating tag:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("tagId");

    if (!tagId) return NextResponse.json({ error: "Tag ID required" }, { status: 400 });

    await prisma.tag.delete({ where: { id: tagId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
