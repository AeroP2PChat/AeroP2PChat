const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aeroSecurity", {
  submit: (credential) => ipcRenderer.invoke("app-lock-authenticate", credential),
  cancel: () => ipcRenderer.send("app-lock-cancel"),
  windowControl: (action) => ipcRenderer.invoke("app-lock-window-control", action),
});
