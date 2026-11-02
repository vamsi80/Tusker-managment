/**
 * Desktop stand-in for the website's Settings → "Desktop apps" card. Inside the
 * app, offering to download the app makes no sense; the same spot shows this
 * app's version and Check for updates instead.
 */
import { AppUpdatesCard } from "~/screens/SettingsScreen";

export function DesktopWidgetSettings() {
    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-base font-semibold">Desktop app</h2>
                <p className="text-sm text-muted-foreground">Tusker on this computer.</p>
            </div>
            <AppUpdatesCard />
        </div>
    );
}
