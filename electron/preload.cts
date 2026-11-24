import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ren", {
  platform: process.platform,
  version: "0.1.0",
  listSources: () => ipcRenderer.invoke("ren:list-sources"),
  ask: (request: unknown) => ipcRenderer.invoke("ren:ask", request),
  showAnnotations: (annotations: unknown[]) => ipcRenderer.invoke("ren:show-annotations", annotations),
  clearAnnotations: () => ipcRenderer.invoke("ren:clear-annotations"),
  onAnnotations: (listener: (annotations: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, annotations: unknown[]) => listener(annotations);
    ipcRenderer.on("ren:annotations", handler);
    return () => ipcRenderer.removeListener("ren:annotations", handler);
  },
});
