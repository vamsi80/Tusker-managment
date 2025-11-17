import "server-only"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import prisma from "@/lib/db"

export const requireWorkspace = cache(async () => {
    const session = await auth.api.getSession({
        headers: await headers(),
    })

    const userId = session?.user.id as string;

    const workspace = await prisma.workspace.findFirst({
        where: { ownerId: userId },
    });

    if (!session) {
        return redirect('/sign-in')
    }

    if (!workspace) {
        return redirect('/create-workspace')
    }

    return session;
});
