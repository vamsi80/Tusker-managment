import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnline } from "~/lib/query";

const STATUS_TEXT: Record<UpdateStatus["state"], (s: UpdateStatus) => string> = {
    idle: () => "",
    checking: () => "Checking for updates…",
    none: () => "You're on the latest version.",
    available: (s) => `Version ${s.version} is available.`,
    downloading: (s) => `Downloading version ${s.version}… ${s.percent ?? 0}%`,
    ready: (s) => `Installing version ${s.version}. Tusker will restart.`,
    error: (s) => `Couldn't check for updates: ${s.message}`,
    dev: () => "Updates work in the installed app, not in development.",
};

/** App-level settings for the desktop app. */
export function SettingsScreen() {
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
        <>
            <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
                <p className="mt-1 text-sm text-foreground/80">Settings for Tusker on this computer.</p>
            </div>

            <section className="flex max-w-3xl flex-col gap-3">
                <h2 className="text-base font-semibold">App</h2>
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-4 shadow-xs">
                    <span className="min-w-0 flex-1 basis-64">
                        <span className="block text-sm font-medium">Tusker for Windows{version && ` · version ${version}`}</span>
                        <span className="block text-sm text-muted-foreground" aria-live="polite">
                            {STATUS_TEXT[status.state](status) || "Updates are checked when Tusker starts and every few hours."}
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
            </section>
        </>
    );
}
