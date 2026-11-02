// Main process: owns the window, the session token and every network request.
// Ported from apps/desktop/main.js (the widget), which has run this way since 0.1.0.
const { app, BrowserWindow, ipcMain, shell, Notification, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

const DEFAULT_BASE = process.env.TUSKER_API_BASE || "https://tusker-managment.vercel.app";
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // set by scripts/dev.mjs
const ICON = path.join(__dirname, "..", "icon.png");

let config = {};
let win;

const configFile = () => path.join(app.getPath("userData"), "config.json");
const save = () => fs.writeFileSync(configFile(), JSON.stringify(config));
const base = () => (config.base || DEFAULT_BASE).replace(/\/+$/, "");

// The token never reaches the page: it is encrypted at rest with the Windows
// user's key (safeStorage) and only attached here, to /api/v1 requests.
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
  win?.webContents.send("session", !!token);
}

// Requests go from here rather than the page: no CORS, and Better Auth's CSRF
// check needs an Origin, which the mobile app sends the same way. Bearer
// requests carry no cookie, so the API's CSRF guard doesn't apply to them.
async function request(pathname, { method = "GET", body, headers = {} } = {}) {
  if (typeof pathname !== "string" || !pathname.startsWith("/api/v1/")) throw new Error("Only /api/v1/ paths are allowed");
  const token = getToken();
  const res = await fetch(base() + pathname, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
      ...headers,
      Origin: new URL(base()).origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (res.status === 401 && token && !pathname.startsWith("/api/v1/auth/")) setToken(null);
  return { ok: res.ok, status: res.status, text, authToken: res.headers.get("set-auth-token") };
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

const openExternal = (url) => /^https?:\/\//.test(url) && shell.openExternal(url);

ipcMain.handle("request", async (_e, pathname, opts) => {
  try {
    return await request(pathname, opts);
  } catch (err) {
    // status 0 = network failure; the page treats it as "offline".
    return { ok: false, status: 0, text: "", error: err.message };
  }
});
ipcMain.handle("session", () => ({ signedIn: !!getToken(), base: base() }));
ipcMain.handle("open", (_e, url) => openExternal(url));

ipcMain.handle("signIn", async (_e, email, password) => {
  try {
    const res = await request("/api/v1/auth/sign-in/email", { method: "POST", body: { email: String(email).trim(), password } });
    let json = {};
    try { json = JSON.parse(res.text); } catch {}
    const token = res.authToken ?? json.token ?? json.session?.token;
    if (!res.ok || !token) return { ok: false, error: json.message || json.error || "Invalid email or password." };
    setToken(token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Can't reach Tusker: ${err.message}` };
  }
});

ipcMain.handle("signOut", async () => {
  await request("/api/v1/auth/sign-out", { method: "POST", body: {} }).catch(() => {});
  setToken(null);
});

ipcMain.handle("notify", (_e, title, body) => {
  const n = new Notification({ title: String(title), body: String(body ?? ""), icon: ICON });
  n.on("click", showWindow);
  n.show();
  if (!win?.isFocused()) win?.flashFrame(true);
});

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", showWindow);
app.setAppUserModelId("com.thewhitetusker.desktop"); // Windows notifications need it

app.whenReady().then(() => {
  try {
    config = JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {}

  win = new BrowserWindow({
    width: config.bounds?.width ?? 1280,
    height: config.bounds?.height ?? 820,
    x: config.bounds?.x,
    y: config.bounds?.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: ICON,
    autoHideMenuBar: true,
    backgroundColor: "#eef2f3",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (config.maximized) win.maximize();

  // Links leave the app for the browser; the window itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (DEV_URL ? !url.startsWith(DEV_URL) : !url.startsWith("file://")) {
      e.preventDefault();
      openExternal(url);
    }
  });
  win.on("focus", () => win.flashFrame(false));
  win.on("close", () => {
    config.maximized = win.isMaximized();
    if (!config.maximized) config.bounds = win.getBounds();
    save();
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  win.once("ready-to-show", () => win.show());

  // Updates come from GitHub Releases in their own repo (see package.json
  // "publish"): electron-updater reads /releases/latest with no tag filter, so
  // sharing the widget's repo would cross the two apps' updates.
  if (app.isPackaged) {
    autoUpdater.on("error", (err) => console.error("[updater]", err.message));
    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    check();
    setInterval(check, 4 * 60 * 60_000);
  }
});

app.on("window-all-closed", () => app.quit());
