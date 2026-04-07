import { NextResponse } from "next/server";
import { getWorkspaces } from "@/data/workspace/get-workspaces";
import { requireUser } from "@/lib/auth/require-user";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspacesResult = await getWorkspaces(user.id);

    return NextResponse.json(workspacesResult);
  } catch (error) {
    console.error("Error in /api/workspaces:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
