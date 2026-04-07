import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { taskId } = await params;

    const comments = await prisma.comment.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { taskId } = await params;
    const body = await request.json();
    const { content } = body;

    const comment = await prisma.comment.create({
      data: {
        content,
        taskId,
        userId: user.id,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      }
    });

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Error posting comment:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
