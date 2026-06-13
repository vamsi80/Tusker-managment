import { Suspense } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { AttendanceSettings } from "../../settings/_components/attendance-settings";
import { ShieldAlert, Clock, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TeamSettingsPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function TeamSettingsContent({ workspaceId }: { workspaceId: string }) {
    const [{ data: permissions }, { data: attendanceSettings }] = await Promise.all([
        serverApiFetch<{ success: boolean; data: { isWorkspaceAdmin: boolean } }>(
            `/workspaces/${workspaceId}/permissions`
        ).catch(() => ({ data: { isWorkspaceAdmin: false } })),
        serverApiFetch<{ success: boolean; data: Record<string, unknown> | null }>(
            `/attendance/settings`,
            { headers: { "x-workspace-id": workspaceId } }
        ).catch(() => ({ data: null })),
    ]);

    if (!permissions.isWorkspaceAdmin) {
        return (
            <div className="flex h-[60vh] w-full flex-col items-center justify-center space-y-4 rounded-xl border-2 border-dashed border-red-200 bg-red-50/50 p-12 text-center animate-in fade-in zoom-in duration-300">
                <div className="rounded-full bg-red-100 p-4">
                    <ShieldAlert className="size-10 text-red-600" />
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
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Tabs defaultValue="attendance" className="w-full">
                <TabsList className="bg-muted/50 p-1 h-12 rounded-xl mb-6 border border-border/50">
                    <TabsTrigger value="attendance" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 h-full gap-2 transition-all">
                        <Clock className="size-4" />
                        Attendance
                    </TabsTrigger>
                    <TabsTrigger value="leaves" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 h-full gap-2 transition-all">
                        <Calendar className="size-4" />
                        Leaves
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="attendance" className="mt-0 focus-visible:outline-none">
                    <AttendanceSettings
                        workspaceId={workspaceId}
                        initialData={attendanceSettings as import("../../settings/_components/attendance-settings").AttendanceSettingsData}
                        isAdmin={permissions.isWorkspaceAdmin}
                    />
                </TabsContent>

                <TabsContent value="leaves" className="mt-0 focus-visible:outline-none">
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-4 p-12 rounded-2xl border-2 border-dashed border-muted-foreground/10 bg-muted/5 text-center flex-col justify-center min-h-[300px]">
                            <div className="p-4 rounded-full bg-primary/10">
                                <Calendar className="size-10 text-primary" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold">Leave Policies</h2>
                                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                    Define leave quotas, accrual rules, and entitlement types for your team here.
                                </p>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
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
