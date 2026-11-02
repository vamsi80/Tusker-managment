// Main process: owns the window, the session token and every network request.
// Ported from apps/desktop/main.js (the widget), which has run this way since 0.1.0.
const { app, BrowserWindow, ipcMain, shell, Notification, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

const DEFAULT_BASE = process.env.TUSKER_API_BASE || "https://tusker-managment.vercel.app";
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // set by scripts/dev.mjs
const ICON = path.join(__dirname, "..", "icon.png");
const RELEASES_REPO = "vamsi80/Tusker-managment";
const RELEASE_TAG_PREFIX = "app-v";

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
  // One spelling per header: the page's headers arrive lower-cased, and mixing
  // "Content-Type" with "content-type" makes fetch send both, merged into
  // "application/json, application/json", which the API doesn't read as JSON.
  const pageHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const res = await fetch(base() + pathname, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      accept: "application/json",
      ...pageHeaders,
      origin: new URL(base()).origin,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    // The website's code (via the page's fetch bridge) sends bodies already serialised.
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (res.status === 401 && token && !pathname.startsWith("/api/v1/auth/")) setToken(null);
  return {
    ok: res.ok,
    status: res.status,
    text,
    contentType: res.headers.get("content-type"),
    authToken: res.headers.get("set-auth-token"),
  };
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

const openExternal = (url) => /^https?:\/\//.test(url) && shell.openExternal(url);

// ─── Updates ────────────────────────────────────────────────────────────────
// Fully automatic: a newer version downloads in the background and installs the
// next time Tusker closes. Settings shows progress and can check right away.
autoUpdater.autoInstallOnAppQuit = true;

/** idle | checking | none | downloading | ready | error | dev; mirrored to Settings. */
let updateState = { state: "idle" };
let checking = false;

function setUpdateState(next) {
  updateState = next;
  win?.webContents.send("updates:status", next);
  win?.setProgressBar(next.state === "downloading" ? Math.max(0.01, (next.percent ?? 0) / 100) : -1);
}

autoUpdater.on("download-progress", (p) => setUpdateState({ ...updateState, state: "downloading", percent: Math.round(p.percent) }));
autoUpdater.on("update-downloaded", (info) => {
  setUpdateState({ state: "ready", version: info.version });
  const n = new Notification({ title: "Tusker update ready", body: `Version ${info.version} installs the next time you close Tusker.`, icon: ICON });
  n.on("click", showWindow);
  n.show();
});
autoUpdater.on("error", (err) => {
  console.error("[updater]", err.message);
  if (updateState.state === "downloading") setUpdateState({ state: "error", message: err.message });
});

// The widget releases from this repo too. electron-updater's GitHub provider only
// reads /releases/latest, which may be a widget release, so find our own newest
// app-v* release and point the generic provider at it. Our update file is app.yml
// (package.json publish.channel), which the widget's updater never looks for.
async function pointFeedAtNewestRelease() {
  const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=30`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again in a while.`);
  const release = (await res.json()).find(
    (r) => !r.draft && !r.prerelease && r.tag_name.startsWith(RELEASE_TAG_PREFIX) && r.assets.some((a) => a.name === "app.yml"),
  );
  if (!release) return false;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: `https://github.com/${RELEASES_REPO}/releases/download/${release.tag_name}`,
    channel: "app", // via the feed, not autoUpdater.channel, which would also allow downgrades
  });
  return true;
}

/** Looks for a newer version; if there is one, it starts downloading on its own. */
async function checkForUpdates() {
  if (!app.isPackaged) {
    setUpdateState({ state: "dev" });
    return updateState;
  }
  if (checking || updateState.state === "downloading" || updateState.state === "ready") return updateState;
  checking = true;
  setUpdateState({ state: "checking" });
  try {
    const result = (await pointFeedAtNewestRelease()) ? await autoUpdater.checkForUpdates() : null;
    if (!result?.isUpdateAvailable) setUpdateState({ state: "none" });
    else if (updateState.state === "checking") setUpdateState({ state: "downloading", version: result.updateInfo.version, percent: 0 });
  } catch (err) {
    setUpdateState({ state: "error", message: err.message });
  } finally {
    checking = false;
  }
  return updateState;
}

ipcMain.handle("updates:check", () => checkForUpdates());
ipcMain.handle("updates:state", () => ({ ...updateState, current: app.getVersion() }));

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

  // Updates come from this repo's app-v* GitHub Releases: checked at launch and
  // every 4 hours, and from Settings → Check for updates.
  if (app.isPackaged) {
    win.once("ready-to-show", () => checkForUpdates());
    setInterval(() => checkForUpdates(), 4 * 60 * 60_000);
  }
});

app.on("window-all-closed", () => app.quit());
