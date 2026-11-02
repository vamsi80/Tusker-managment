import { Download, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

// apps/desktop publishes here (electron-builder "publish" → GitHub Releases), and
// the widget's auto-updater reads the same release, so this link always serves
// the newest build. Too big (110MB+) to ship from /public.
const SETUP_URL =
    "https://github.com/vamsi80/Tusker-managment/releases/latest/download/Tusker-Widget-Setup.exe";

export function DesktopWidgetSettings() {
    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-base font-semibold">Desktop widget</h2>
                <p className="text-sm text-muted-foreground">Keep Tusker on your desktop, outside the browser.</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-xs dark:bg-card">
                <span className="flex min-w-0 flex-1 basis-64 items-start gap-3">
                    <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-primary-ink" />
                    <span>
                        <span className="block text-sm font-medium">Tusker Widget for Windows</span>
                        <span className="block text-sm text-muted-foreground">
                            Clock in/out, today&apos;s tasks, your next meeting and notifications. Run the
                            setup file, then sign in; it updates itself.
                        </span>
                    </span>
                </span>
                <Button asChild variant="outline" className="shrink-0">
                    <a href={SETUP_URL} download>
                        <Download className="size-4" /> Download for Windows
                    </a>
                </Button>
            </div>
        </div>
    );
}
