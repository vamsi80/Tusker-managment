const { contextBridge, ipcRenderer } = require("electron");

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("tusker", {
  api: call("api"),
  state: call("state"),
  setWorkspace: call("setWorkspace"),
  signIn: call("signIn"),
  signOut: call("signOut"),
  open: call("open"),
  hide: call("hide"),
  notify: call("notify"),
  tooltip: call("tooltip"),
});
