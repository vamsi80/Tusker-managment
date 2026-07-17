import { SettingsNav } from "./_components/settings-nav";

interface SettingsLayoutProps {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function SettingsLayout({
    children,
    params,
}: SettingsLayoutProps) {
    const { workspaceId } = await params;

    return (
        <div className="flex flex-col size-full">
            <SettingsNav workspaceId={workspaceId} />
            <div className="flex-1 w-full">
                {children}
            </div>
        </div>
    );
}
