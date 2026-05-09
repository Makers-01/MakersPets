const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("makersPetDesktop", {
  getState: () => ipcRenderer.invoke("desktop:get-state"),
  fitWindow: (payload) => ipcRenderer.invoke("desktop:fit-window", payload),
  dragWindow: (payload) => ipcRenderer.invoke("desktop:drag-window", payload),
  sendDragWindow: (payload) => ipcRenderer.send("desktop:drag-window-event", payload),
  togglePinned: () => ipcRenderer.invoke("desktop:toggle-pin"),
  minimize: () => ipcRenderer.invoke("desktop:minimize"),
  showContextMenu: (labels) => ipcRenderer.invoke("desktop:show-context-menu", labels),
  openRoute: (routePath) => ipcRenderer.invoke("desktop:open-route", routePath),
  openExternal: (target) => ipcRenderer.invoke("desktop:open-external", target)
});
