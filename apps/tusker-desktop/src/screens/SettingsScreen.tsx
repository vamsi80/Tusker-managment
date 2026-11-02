import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribeOnline = (cb: () => void) => {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
    };
};
/** False while the computer has no network connection. */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine);

const STATUS_TEXT: Record<UpdateStatus["state"], (s: UpdateStatus) => string> = {
    idle: () => "",
    checking: () => "Checking for updates…",
    none: () => "You're on the latest version.",
    downloading: (s) => `Downloading version ${s.version}… ${s.percent ?? 0}%`,
    ready: (s) => `Version ${s.version} is ready. It installs the next time you close Tusker.`,
    error: (s) => `Couldn't check for updates: ${s.message}`,
    dev: () => "Updates work in the installed app, not in development.",
};

/**
 * This app's version, update status and Check for updates. Shown in the
 * website's Settings page (in place of its "Desktop apps" download card), styled
 * like that page's other cards.
 */
export function AppUpdatesCard() {
    const online = useOnline();
    const [version, setVersion] = useState("");
    const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

    useEffect(() => {
        window.tusker.updateState().then(({ current, ...s }) => {
            setVersion(current);
            setStatus(s);
        });
        return window.tusker.onUpdateStatus(setStatus);
    }, []);

    const busy = status.state === "checking" || status.state === "downloading" || status.state === "ready";

    return (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-xs dark:bg-card">
            <span className="min-w-0 flex-1 basis-64">
                <span className="block text-sm font-medium">Tusker for Windows{version && ` · version ${version}`}</span>
                <span className="block text-sm text-muted-foreground" aria-live="polite">
                    {STATUS_TEXT[status.state](status) || "Updates download on their own and install when you close Tusker."}
                </span>
            </span>
            <Button
                variant="outline"
                className="shrink-0"
                disabled={busy || !online}
                title={online ? undefined : "Checking for updates needs a connection"}
                onClick={() => window.tusker.checkForUpdates()}
            >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Check for updates
            </Button>
        </div>
    );
}

/** Standalone page (/w/:workspaceId/app-settings), e.g. if the website's Settings can't load. */
export function SettingsScreen() {
    return (
        <div className="flex max-w-3xl flex-col gap-6">
            <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">App settings</h1>
                <p className="mt-1 text-sm text-foreground/80">Settings for Tusker on this computer.</p>
            </div>
            <AppUpdatesCard />
        </div>
    );
}
