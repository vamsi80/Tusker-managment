import { ReactNode } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamSectionHeader } from "./_components/team-section-header";

interface TeamLayoutProps {
    children: ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
    const { workspaceId } = await params;

    return (
        <div className="flex flex-col gap-4 sm:gap-5 w-full">
            <TeamSectionHeader workspaceId={workspaceId} />
            <div className="mt-4">
                {children}
            </div>
        </div>
    );
}
