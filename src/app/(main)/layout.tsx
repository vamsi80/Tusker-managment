
import React from "react"
import { Navbar } from "./_components/navbar"
import { requireUser } from "../data/user/require-user";
import { getUserWorkspaces } from "../data/workspace/get-user-workspace";


export default async function LayoutMain({ children }: { children: React.ReactNode }) {
    const session = await requireUser();
    const userWorkspaces = await getUserWorkspaces(session.id);
    return (
        <div>
            <Navbar workspaceId={userWorkspaces.workspaces[0].workspaceId} />
            <main className="container mx-auto px-4 md:px-6 lg:px-8 mb-32">
                {children}
            </main>
        </div>
    )
}
