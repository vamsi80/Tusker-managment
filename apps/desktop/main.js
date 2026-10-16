const { app, BrowserWindow, Tray, Menu, ipcMain, shell, Notification, safeStorage, screen } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

// Windows location services. Chromium's default network provider needs a
// Google API key, and check-in is geofenced, so it must get a real position.
app.commandLine.appendSwitch("enable-features", "WinrtGeolocationImplementation");

const DEFAULT_BASE = process.env.TUSKER_API_BASE || "https://tusker-managment.vercel.app";
const ICON = path.join(__dirname, "icon.png");

let config = {};
let win;
let tray;
let quitting = false;
let updateReady = false;

const configFile = () => path.join(app.getPath("userData"), "config.json");
const save = () => fs.writeFileSync(configFile(), JSON.stringify(config));
const base = () => config.base || DEFAULT_BASE;

function getToken() {
  if (!config.token) return null;
  try {
    return safeStorage.decryptString(Buffer.from(config.token, "base64"));
  } catch {
    return null;
  }
}

function setToken(token) {
  config.token = token ? safeStorage.encryptString(token).toString("base64") : undefined;
  save();
}

// Requests go from here rather than the page: no CORS, and Better Auth's CSRF
// check needs the Origin header, which the mobile app sends the same way.
async function api(pathname, { method = "GET", body } = {}) {
  if (!pathname.startsWith("/api/v1/")) throw new Error("Only /api/v1/ paths are allowed");
  const token = getToken();
  const res = await fetch(base() + pathname, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(base()).origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token) setToken(null);
  return { ok: res.ok, status: res.status, json, authToken: res.headers.get("set-auth-token") };
}

function showWindow() {
  win.show();
  win.focus();
}

function openExternal(url) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
}

function buildTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show", click: showWindow },
      {
        label: "Always on top",
        type: "checkbox",
        checked: win.isAlwaysOnTop(),
        click: (item) => {
          win.setAlwaysOnTop(item.checked);
          config.pinned = item.checked;
          save();
        },
      },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { label: "Open Tusker", click: () => openExternal(base()) },
      // The widget lives in the tray and rarely quits, so offer the restart.
      ...(updateReady ? [{ label: "Restart to update", click: () => { quitting = true; autoUpdater.quitAndInstall(); } }] : []),
      { type: "separator" },
      { label: "Quit", click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

ipcMain.handle("api", (_e, pathname, opts) => api(pathname, opts));
ipcMain.handle("state", () => ({ signedIn: !!getToken(), base: base(), workspaceId: config.workspaceId }));
ipcMain.handle("setWorkspace", (_e, id) => { config.workspaceId = id; save(); });
ipcMain.handle("open", (_e, url) => openExternal(url));
ipcMain.handle("hide", () => win.hide());
ipcMain.handle("tooltip", (_e, text) => tray.setToolTip(text));

ipcMain.handle("signIn", async (_e, serverUrl, email, password) => {
  config.base = serverUrl.replace(/\/+$/, "") || DEFAULT_BASE;
  save();
  try {
    const res = await api("/api/v1/auth/sign-in/email", { method: "POST", body: { email, password } });
    const token = res.authToken ?? res.json?.token ?? res.json?.session?.token;
    if (!res.ok || !token) return { ok: false, error: res.json?.message || "Invalid email or password." };
    setToken(token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Can't reach ${config.base}: ${err.message}` };
  }
});

ipcMain.handle("signOut", async () => {
  await api("/api/v1/auth/sign-out", { method: "POST" }).catch(() => {});
  setToken(null);
});

ipcMain.handle("notify", (_e, title, body, url) => {
  const n = new Notification({ title, body, icon: ICON });
  n.on("click", () => (url ? openExternal(url) : showWindow()));
  n.show();
});

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showWindow());
app.setAppUserModelId("com.thewhitetusker.widget"); // Windows notifications need it

app.whenReady().then(() => {
  try {
    config = JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {}

  const { workArea } = screen.getPrimaryDisplay();
  const width = 340;
  const height = 560;
  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + workArea.height - height - 16,
    minWidth: 280,
    minHeight: 300,
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: config.pinned ?? true,
    show: false,
    icon: ICON,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  tray = new Tray(ICON);
  tray.setToolTip("Tusker");
  tray.on("click", () => (win.isVisible() ? win.hide() : showWindow()));
  buildTrayMenu();
  win.on("always-on-top-changed", buildTrayMenu);

  // Updates come from GitHub Releases (see .github/workflows/desktop-release.yml).
  if (app.isPackaged) {
    autoUpdater.on("update-downloaded", () => { updateReady = true; buildTrayMenu(); });
    autoUpdater.on("error", (err) => console.error("[updater]", err.message));
    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    check();
    setInterval(check, 4 * 60 * 60_000);
  }
});

app.on("before-quit", () => (quitting = true));
