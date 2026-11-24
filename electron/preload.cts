import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ren", {
  platform: process.platform,
  version: "0.1.0",
  listSources: () => ipcRenderer.invoke("ren:list-sources"),
  primarySource: () => ipcRenderer.invoke("ren:primary-source"),
  permissionStatus: () => ipcRenderer.invoke("ren:permission-status"),
  requestPermissions: () => ipcRenderer.invoke("ren:request-permissions"),
  openPermissionSettings: () => ipcRenderer.invoke("ren:open-permission-settings"),
  setExpanded: (expanded: boolean) => ipcRenderer.invoke("ren:set-expanded", expanded),
  setCaptureHidden: (hidden: boolean) => ipcRenderer.invoke("ren:set-capture-hidden", hidden),
  captureContext: () => ipcRenderer.invoke("ren:capture-context"),
  ask: (request: unknown) => ipcRenderer.invoke("ren:ask", request),
  showAnnotations: (annotations: unknown[]) => ipcRenderer.invoke("ren:show-annotations", annotations),
  clearAnnotations: () => ipcRenderer.invoke("ren:clear-annotations"),
  onAnnotations: (listener: (annotations: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, annotations: unknown[]) => listener(annotations);
    ipcRenderer.on("ren:annotations", handler);
    return () => ipcRenderer.removeListener("ren:annotations", handler);
  },
});
