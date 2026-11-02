const { contextBridge, ipcRenderer } = require("electron");

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

// The page's only way out: no Node, no token, just these calls (see src/global.d.ts).
contextBridge.exposeInMainWorld("tusker", {
  request: call("request"),
  session: call("session"),
  signIn: call("signIn"),
  signOut: call("signOut"),
  notify: call("notify"),
  open: call("open"),
  checkForUpdates: call("updates:check"),
  updateState: call("updates:state"),
  onUpdateStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  },
  onSession: (cb) => {
    const listener = (_e, signedIn) => cb(signedIn);
    ipcRenderer.on("session", listener);
    return () => ipcRenderer.removeListener("session", listener);
  },
});
