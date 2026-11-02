import type { LucideIcon } from "lucide-react";
import { Download, LayoutDashboard, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

// Both apps publish to this repo's GitHub Releases, told apart by tag prefix
// (desktop-v* widget, app-v* full app). A releases/latest/download link can't be
// used: "latest" is whichever app released last.
const WIDGET_RELEASES = { repo: "vamsi80/Tusker-managment", tagPrefix: "desktop-v" };
const APP_RELEASES = { repo: "vamsi80/Tusker-managment", tagPrefix: "app-v" };

type Release = {
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: { name: string; browser_download_url: string }[];
};

/** Newest published installer in `repo` whose tag starts with `tagPrefix`; null when there is none or GitHub is unreachable. */
async function installerUrl({ repo, tagPrefix }: { repo: string; tagPrefix: string }): Promise<string | null> {
    try {
        // ponytail: unauthenticated API (60 req/h per IP); hourly revalidate keeps us far under it.
        const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=50`, { next: { revalidate: 3600 } });
        if (!res.ok) return null;
        const releases: Release[] = await res.json();
        const exe = (r: Release) => r.assets.find((a) => a.name.endsWith(".exe"));
        const release = releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(tagPrefix) && exe(r));
        return release ? exe(release)!.browser_download_url : null;
    } catch {
        // The button shows "Coming soon" rather than breaking Settings.
        return null;
    }
}

function DownloadRow({ icon: Icon, title, description, url }: { icon: LucideIcon; title: string; description: string; url: string | null }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-xs dark:bg-card">
            <span className="flex min-w-0 flex-1 basis-64 items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary-ink" />
                <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
            </span>
            {url ? (
                <Button asChild variant="outline" className="shrink-0">
                    <a href={url} download>
                        <Download className="size-4" /> Download for Windows
                    </a>
                </Button>
            ) : (
                <Button variant="outline" className="shrink-0" disabled>
                    Coming soon
                </Button>
            )}
        </div>
    );
}

export async function DesktopWidgetSettings() {
    const [widgetUrl, appUrl] = await Promise.all([installerUrl(WIDGET_RELEASES), installerUrl(APP_RELEASES)]);

    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-base font-semibold">Desktop apps</h2>
                <p className="text-sm text-muted-foreground">Keep Tusker on your desktop, outside the browser.</p>
            </div>
            <DownloadRow
                icon={MonitorSmartphone}
                title="Tusker Widget for Windows"
                description="Clock in/out, today's tasks, your next meeting and notifications. Run the setup file, then sign in; it updates itself."
                url={widgetUrl}
            />
            <DownloadRow
                icon={LayoutDashboard}
                title="Tusker for Windows"
                description="The full Tusker app. Shows your saved data even offline and stays in sync with the website and the mobile app."
                url={appUrl}
            />
        </div>
    );
}
