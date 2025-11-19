import "server-only";

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import prisma from "@/lib/db"

export const requireWorkspaceAdmin = cache(
    async (slug: string) => {
        const session = await auth.api.getSession({
            headers: await headers(),
        })

        if (!session) {
            return redirect('/sign-in')
        }

        const workspaceAdmin = await prisma.workspaceMember.findFirst({
            where: {
                userId: session.user.id,
                workspace: {
                    slug: slug,
                },
                role: "ADMIN",
            }
        })

        if (!workspaceAdmin || workspaceAdmin.role !== "ADMIN") {
            return redirect("/not-admin")
        }
        return session;
    }
);
