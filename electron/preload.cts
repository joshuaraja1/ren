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
  hostedImageStatus: () => ipcRenderer.invoke("ren:image-service-status"),
  saveHostedImageSettings: (value: unknown) => ipcRenderer.invoke("ren:image-service-save", value),
  clearHostedImageSettings: () => ipcRenderer.invoke("ren:image-service-clear"),
  enableCircleInput: () => ipcRenderer.invoke("ren:enable-circle-input"),
  requestPermissions: () => ipcRenderer.invoke("ren:request-permissions"),
  openPermissionSettings: (kind?: "screen" | "microphone") => ipcRenderer.invoke("ren:open-permission-settings", kind),
  setExpanded: (expanded: boolean) => ipcRenderer.invoke("ren:set-expanded", expanded),
  setCompanionVisible: (visible: boolean) => ipcRenderer.invoke("ren:set-companion-visible", visible),
  captureContext: (preserveVisual?: boolean, question?: string) => ipcRenderer.invoke("ren:capture-context", preserveVisual === true, question),
  wakeAvailable: () => ipcRenderer.invoke("ren:wake-available"),
  wakeStart: (sampleRate: number) => ipcRenderer.invoke("ren:wake-start", sampleRate),
  wakeFeed: (samples: number[]) => ipcRenderer.invoke("ren:wake-feed", samples),
  wakeStop: () => ipcRenderer.invoke("ren:wake-stop"),
  speechAvailable: () => ipcRenderer.invoke("ren:speech-available"),
  speechStart: (sampleRate: number) => ipcRenderer.invoke("ren:speech-start", sampleRate),
  speechFeed: (samples: number[]) => ipcRenderer.invoke("ren:speech-feed", samples),
  speechFinish: () => ipcRenderer.invoke("ren:speech-finish"),
  speechStop: () => ipcRenderer.invoke("ren:speech-stop"),
  deepgramStatus: () => ipcRenderer.invoke("ren:deepgram-status"),
  saveDeepgramKey: (key: string) => ipcRenderer.invoke("ren:deepgram-save", key),
  clearDeepgramKey: () => ipcRenderer.invoke("ren:deepgram-clear"),
  speak: (id: string, text: string) => ipcRenderer.invoke("ren:speak", id, text),
  onSpeechData: (listener: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => listener(data);
    ipcRenderer.on("ren:speech-data", handler);
    return () => ipcRenderer.removeListener("ren:speech-data", handler);
  },
  ask: (request: unknown) => ipcRenderer.invoke("ren:ask", request),
  clearAnnotations: () => ipcRenderer.invoke("ren:clear-annotations"),
  generateIllustration: (automatic?: boolean) => ipcRenderer.invoke("ren:generate-illustration", automatic === true),
  onIllustration: (listener: (image: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, image: unknown) => listener(image);
    ipcRenderer.on("ren:illustration", handler);
    return () => ipcRenderer.removeListener("ren:illustration", handler);
  },
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
  onOrbitPointer: (listener: (point: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, point: unknown) => listener(point);
    ipcRenderer.on("ren:orbit-pointer", handler);
    return () => ipcRenderer.removeListener("ren:orbit-pointer", handler);
  },
  onFocusSelection: (listener: (kind: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, kind: unknown) => listener(kind);
    ipcRenderer.on("ren:focus-selection", handler);
    return () => ipcRenderer.removeListener("ren:focus-selection", handler);
  },
  onActivateVoice: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("ren:activate-voice", handler);
    return () => ipcRenderer.removeListener("ren:activate-voice", handler);
  },
  onOpenPanel: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("ren:open-panel", handler);
    return () => ipcRenderer.removeListener("ren:open-panel", handler);
  },
  voiceShortcutAvailable: () => ipcRenderer.invoke("ren:voice-shortcut-available"),
  voiceModeStatus: () => ipcRenderer.invoke("ren:voice-mode"),
  stopVoiceConversation: () => ipcRenderer.invoke("ren:voice-stop-conversation"),
  onVoiceModeChanged: (listener: (mode: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: unknown) => listener(mode);
    ipcRenderer.on("ren:voice-mode", handler);
    return () => ipcRenderer.removeListener("ren:voice-mode", handler);
  },
  startAgentJob: (input: unknown) => ipcRenderer.invoke("ren:job-start", input),
  cancelAgentJob: (id: string) => ipcRenderer.invoke("ren:job-cancel", id),
  onAgentJobUpdate: (listener: (job: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, job: unknown) => listener(job);
    ipcRenderer.on("ren:job-update", handler);
    return () => ipcRenderer.removeListener("ren:job-update", handler);
  },
});
