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
  onSession: (cb) => {
    const listener = (_e, signedIn) => cb(signedIn);
    ipcRenderer.on("session", listener);
    return () => ipcRenderer.removeListener("session", listener);
  },
});
