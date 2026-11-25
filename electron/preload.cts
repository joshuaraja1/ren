import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ren", {
  platform: process.platform,
  version: "0.1.0",
  listSources: () => ipcRenderer.invoke("ren:list-sources"),
  primarySource: () => ipcRenderer.invoke("ren:primary-source"),
  permissionStatus: () => ipcRenderer.invoke("ren:permission-status"),
  visionStatus: () => ipcRenderer.invoke("ren:vision-status"),
  saveVisionSettings: (value: unknown) => ipcRenderer.invoke("ren:vision-save", value),
  clearVisionSettings: () => ipcRenderer.invoke("ren:vision-clear"),
  enableCircleInput: () => ipcRenderer.invoke("ren:enable-circle-input"),
  requestPermissions: () => ipcRenderer.invoke("ren:request-permissions"),
  openPermissionSettings: () => ipcRenderer.invoke("ren:open-permission-settings"),
  setExpanded: (expanded: boolean) => ipcRenderer.invoke("ren:set-expanded", expanded),
  setCaptureHidden: (hidden: boolean) => ipcRenderer.invoke("ren:set-capture-hidden", hidden),
  captureContext: () => ipcRenderer.invoke("ren:capture-context"),
  wakeAvailable: () => ipcRenderer.invoke("ren:wake-available"),
  wakeStart: (sampleRate: number) => ipcRenderer.invoke("ren:wake-start", sampleRate),
  wakeFeed: (samples: number[]) => ipcRenderer.invoke("ren:wake-feed", samples),
  wakeStop: () => ipcRenderer.invoke("ren:wake-stop"),
  speechAvailable: () => ipcRenderer.invoke("ren:speech-available"),
  speechStart: (sampleRate: number) => ipcRenderer.invoke("ren:speech-start", sampleRate),
  speechFeed: (samples: number[]) => ipcRenderer.invoke("ren:speech-feed", samples),
  speechFinish: () => ipcRenderer.invoke("ren:speech-finish"),
  speechStop: () => ipcRenderer.invoke("ren:speech-stop"),
  ask: (request: unknown) => ipcRenderer.invoke("ren:ask", request),
  showAnnotations: (annotations: unknown[]) => ipcRenderer.invoke("ren:show-annotations", annotations),
  showVisualLesson: (lesson: unknown) => ipcRenderer.invoke("ren:show-visual-lesson", lesson),
  clearAnnotations: () => ipcRenderer.invoke("ren:clear-annotations"),
  onAnnotations: (listener: (annotations: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, annotations: unknown[]) => listener(annotations);
    ipcRenderer.on("ren:annotations", handler);
    return () => ipcRenderer.removeListener("ren:annotations", handler);
  },
  onVisualLesson: (listener: (lesson: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, lesson: unknown) => listener(lesson);
    ipcRenderer.on("ren:visual-lesson", handler);
    return () => ipcRenderer.removeListener("ren:visual-lesson", handler);
  },
  onFocusSelection: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("ren:focus-selection", handler);
    return () => ipcRenderer.removeListener("ren:focus-selection", handler);
  },
});
