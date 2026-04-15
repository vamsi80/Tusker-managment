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

            {/* Navigation Tabs */}
            <div className="w-full border-b pb-2">
                <Tabs defaultValue="members" className="w-[400px]">
                    <TabsList>
                        <TabsTrigger value="members" asChild>
                            <Link href={`/w/${workspaceId}/team`}>Members</Link>
                        </TabsTrigger>
                        <TabsTrigger value="attendance" asChild>
                            <Link href={`/w/${workspaceId}/team/attendance`}>Attendance</Link>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Content Area (page.tsx or attendance/page.tsx) */}
            <div className="mt-4">
                {children}
            </div>
        </div>
    );
}
