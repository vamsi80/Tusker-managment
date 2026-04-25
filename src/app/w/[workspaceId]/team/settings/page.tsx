import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getAttendanceSettings } from "@/data/attendance/get-attendance-settings";
import { AttendanceSettings } from "../../settings/_components/attendance-settings";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

interface TeamSettingsPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function TeamSettingsContent({ workspaceId }: { workspaceId: string }) {
    const [permissions, attendanceSettings] = await Promise.all([
        getWorkspacePermissions(workspaceId),
        getAttendanceSettings(workspaceId),
    ]);

    // Strict blockage for Managers and regular Members
    if (!permissions.isWorkspaceAdmin) {
        return (
            <div className="flex h-[60vh] w-full flex-col items-center justify-center space-y-4 rounded-xl border-2 border-dashed border-red-200 bg-red-50/50 p-12 text-center animate-in fade-in zoom-in duration-300">
                <div className="rounded-full bg-red-100 p-4">
                    <ShieldAlert className="h-10 w-10 text-red-600" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight text-red-900">Access Denied</h2>
                    <p className="max-w-[400px] text-red-700/80">
                        This area is restricted to Workspace Owners and Admins only. 
                        You do not have the necessary permissions to manage team attendance settings.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <AttendanceSettings
                workspaceId={workspaceId}
                initialData={attendanceSettings}
                isAdmin={permissions.isWorkspaceAdmin}
            />
        </div>
    );
}

export default async function TeamSettingsPage({ params }: TeamSettingsPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <Suspense fallback={<AppLoader />}>
                <TeamSettingsContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
