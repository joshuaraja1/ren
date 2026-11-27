import "dotenv/config";
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { askTeacher, type Annotation } from "./provider.js";
import { feedWake, startWake, stopWake, wakeAvailable } from "./wake.js";
import { feedSpeech, finishSpeech, speechAvailable, startSpeech, stopSpeech } from "./speech.js";
import { clearDeepgramKey, deepgramStatus, saveDeepgramKey } from "./deepgram-settings.js";
import { streamWithDeepgram } from "./deepgram-tts.js";
import { normalizeCursor } from "./display-geometry.js";
import { startCircleInput, stopCircleInput } from "./circle-input.js";
import type { FocusRegion } from "./circle-geometry.js";
import { clearVisionSettings, saveVisionSettings, visionCredentials, visionStatus } from "./vision-settings.js";
import { clearHostedImageSettings, hostedImageCredentials, hostedImageStatus, saveHostedImageSettings } from "./hosted-image-settings.js";
import { parseAskRequest } from "./request-validation.js";
import { hasMeaningfulMotion } from "./frame-motion.js";
import { isSameStableScreen } from "./screen-continuity.js";
import { canPlaceSpatialVisual } from "./visual-safety.js";
import { generateIllustration, imageManifest, imagePrompt } from "./image-render.js";
import { generateSceneSpec, wantsAssemblyAnimation, wantsAssemblySequence } from "./scene-generation.js";
import { generateHostedIllustration } from "./hosted-image-render.js";
import { filterOpaquePositions, locateImageParts, type ImageRegistration } from "./image-registration.js";
import { validateVisualLesson } from "./visual-lesson.js";
import { likelyVisualFollowUp, requestedVisualDimension, wantsPriorAssemblyGuide, wantsPriorVisualIn3D, wantsReferenceRecreation, wantsVisualCreation } from "./visual-intent.js";
import { centerRequestedLesson } from "./visual-presentation.js";
import { answerForInteractiveScene, interactiveSceneFor, tagRequestedInteractiveScene } from "./interactive-scene.js";
import { CaptureSession } from "./capture-session.js";
import { cancelActiveAsk, type ActiveAskRequest } from "./ask-cancellation.js";
import { requestMacScreenCaptureAccess } from "./mac-screen-permission.js";
import type { VisualLesson } from "./visual-lesson.js";
import { AgentJobManager } from "./agent-jobs.js";
import { consumeAgentJobCapture } from "./agent-job-capture.js";
import { wantsCurrentScreen, wantsSpatialGuidance } from "./screen-intent.js";
import { createFreeCadModel, planCadModel, wantsCadCreation } from "./cad-model.js";
import { wantsToDelegateCurrentTask, wantsGuidedWorkflow } from "./guided-workflow.js";
import { activateComputerTarget, performComputerAction, planComputerAction, readComputerTarget, type ComputerAction } from "./computer-operator.js";
import { wantsComputerExecution } from "./computer-intent.js";

type Illustration = { image: string; preview: boolean; width: number; height: number; registration?: ImageRegistration };
type ActiveVisual = { lesson: VisualLesson; displayId: number; createdAt: number; referenceImage?: string };

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let voicePaused = false;
let voicePauseEpoch = 0;
let alwaysOnVoice = false;
const agentJobs = new AgentJobManager();
let selectedFocus: { displayId: number; region: FocusRegion; createdAt: number } | null = null;
let userSketch: { displayId: number; points: FocusRegion["points"] } | null = null;
let circleInputActive = false;
const captureSession = new CaptureSession();
let lastCaptureData: { token: string; generation: number; frames: string[]; pointer: { x: number; y: number }; focus?: { x: number; y: number; width: number; height: number }; firstSample: Uint8Array; secondSample: Uint8Array; dynamicContent: boolean; thumbnailSize: { width: number; height: number } } | null = null;
let lastVisualLesson: ActiveVisual | null = null;
let screenCaptureBusy = false;
let imageRenderAbort: AbortController | null = null;
let activeAskRequest: ActiveAskRequest | null = null;
let imageRequestBusy = false;
let imageRequestedFor: VisualLesson | null = null;
let pendingVisualDecision = false;
let computerOperatorBusy = false;
let voiceShortcutActive = false;
const speechOutputControllers = new Map<string, AbortController>();
let visualGeneration = 0;
let permissionRequest: Promise<ReturnType<typeof permissionStatus>> | null = null;
let overlayAnnotations: Annotation[] = [];
let overlayLesson: VisualLesson | null = null;
let overlayIllustration: Illustration | null = null;
let focusOverlaySnapshot: {
  annotations: Annotation[];
  lesson: VisualLesson | null;
  illustration: Illustration | null;
  visual: ActiveVisual | null;
  bounds: Electron.Rectangle;
  visible: boolean;
  generation: number;
} | null = null;

function sendOverlayAnnotations(value: Annotation[]) {
  overlayAnnotations = value;
  overlayWindow?.webContents.send("ren:annotations", value);
}
function sendOverlayLesson(value: VisualLesson | null) {
  overlayLesson = value;
  overlayIllustration = null;
  if (value && focusOverlaySnapshot?.visual?.lesson === value) focusOverlaySnapshot.lesson = value;
  overlayWindow?.webContents.send("ren:visual-lesson", value);
}
function sendOverlayIllustration(value: Illustration | null) {
  overlayIllustration = value;
  if (value && focusOverlaySnapshot) focusOverlaySnapshot.illustration = value;
  overlayWindow?.webContents.send("ren:illustration", value);
}



const collapsedSize = { width: 190, height: 38 };
const expandedSize = { width: 475, height: 620 };

function onboardingMarkerPath() { return join(app.getPath("userData"), "onboarding-complete"); }
function hasCompletedOnboarding() { return existsSync(onboardingMarkerPath()); }
function permissionStatus() {
  if (process.platform !== "darwin") {
    const complete = hasCompletedOnboarding();
    return { ready: complete, microphone: complete ? "granted" : "not-requested", screen: complete ? "granted" : "not-requested", interaction: circleInputActive ? "granted" : "unavailable" };
  }
  const microphone = systemPreferences.getMediaAccessStatus("microphone");
  const screenAccess = systemPreferences.getMediaAccessStatus("screen");
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  return { ready: screenAccess === "granted", microphone, screen: screenAccess, interaction: circleInputActive ? "granted" : accessibility ? "unavailable" : "not-granted" };
}

function positionMainWindow(expanded: boolean, displayId?: number) {
  if (!mainWindow) return;
  const display = (displayId && screen.getAllDisplays().find((item) => item.id === displayId))
    || (expanded ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : screen.getPrimaryDisplay());
  const workArea = display.workArea;
  const size = expanded ? expandedSize : collapsedSize;
  mainWindow.setBounds({ x: Math.round(workArea.x + (workArea.width - size.width) / 2), y: expanded ? workArea.y + 8 : display.bounds.y, ...size }, false);
}

function repositionMainWindow(displayId?: number) {
  const bounds = mainWindow?.getBounds();
  if (!bounds) return;
  positionMainWindow(bounds.width !== collapsedSize.width, displayId);
}

function createOverlayWindow() {
  const bounds = screen.getPrimaryDisplay().bounds;
  overlayWindow = new BrowserWindow({
    ...bounds,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void overlayWindow.loadURL(`${developmentUrl}/overlay.html`);
  else void overlayWindow.loadFile(join(currentDirectory, "../dist/overlay.html"));
}

function cursorDisplayContext() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  return {
    display,
    pointer: normalizeCursor(cursor, display.bounds),
  };
}

async function captureDisplay(displayId: number, thumbnailSize: { width: number; height: number }) {
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
  const source = sources.find((candidate) => candidate.display_id === String(displayId));
  return source && !source.thumbnail.isEmpty() ? source.thumbnail : null;
}

const motionSample = (image: Electron.NativeImage) => image.resize({ width: 64, height: 36 }).toBitmap();

function requireMainRenderer(event: Electron.IpcMainInvokeEvent) {
  if (event.sender !== mainWindow?.webContents) throw new Error("Not allowed");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    ...collapsedSize,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // A floating window falls behind native full-screen Spaces on macOS.
  // Keep the assistant at the same level as its drawing overlay.
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.once("ready-to-show", () => {
    const access = permissionStatus();
    const needsOnboarding = process.platform === "darwin" ? access.microphone !== "granted" : !access.ready;
    positionMainWindow(false);
    if (needsOnboarding) mainWindow?.showInactive();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void mainWindow.loadURL(developmentUrl);
  else void mainWindow.loadFile(join(currentDirectory, "../dist/index.html"));
}

function createTray() {
  const iconPath = app.isPackaged ? join(process.resourcesPath, "tray-icon.png") : join(app.getAppPath(), "build/icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip("Ren");
  updateTrayMenu();
}

function voiceMode() { return { paused: voicePaused, alwaysOn: alwaysOnVoice }; }

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "AI settings", click: () => mainWindow?.webContents.send("ren:open-panel") },
    { label: "Start voice conversation", enabled: !voicePaused, click: () => mainWindow?.webContents.send("ren:activate-voice") },
    { label: alwaysOnVoice ? "Turn always-on voice off" : "Turn always-on voice on", click: () => setAlwaysOnVoice(!alwaysOnVoice) },
    { label: voicePaused ? "Resume Ren" : "Pause Ren", click: () => setVoicePaused(!voicePaused) },
    { type: "separator" },
    { role: "quit" },
  ]));
}

function setAlwaysOnVoice(value: boolean) {
  alwaysOnVoice = value;
  try { writeFileSync(join(app.getPath("userData"), "voice-mode.json"), JSON.stringify({ alwaysOn: value }), { mode: 0o600 }); } catch { /* session still works */ }
  updateTrayMenu();
  mainWindow?.webContents.send("ren:voice-mode", voiceMode());
}

function setVoicePaused(value: boolean) {
  voicePaused = value;
  if (value) {
    voicePauseEpoch += 1;
    visualGeneration += 1;
    stopWake();
    stopSpeech();
    for (const controller of speechOutputControllers.values()) controller.abort();
    activeAskRequest?.controller.abort();
    agentJobs.cancelAll();
    imageRenderAbort?.abort();
    imageRenderAbort = null;
    lastCaptureData = null;
    captureSession.invalidate();
    overlayWindow?.hide();
  }
  updateTrayMenu();
  mainWindow?.webContents.send("ren:voice-mode", voiceMode());
  if (value) mainWindow?.hide();
}

app.whenReady().then(() => {
  try { alwaysOnVoice = JSON.parse(readFileSync(join(app.getPath("userData"), "voice-mode.json"), "utf8")).alwaysOn === true; } catch { /* default is wake mode */ }
  if (permissionStatus().ready && app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  createMainWindow();
  createOverlayWindow();
  ipcMain.on("ren:overlay-ready", (event) => {
    if (event.sender !== overlayWindow?.webContents) return;
    event.sender.send("ren:annotations", overlayAnnotations);
    event.sender.send("ren:visual-lesson", overlayLesson);
    event.sender.send("ren:illustration", overlayIllustration);
  });
  createTray();
  agentJobs.onUpdate((snapshot) => mainWindow?.webContents.send("ren:job-update", snapshot));
  voiceShortcutActive = globalShortcut.register("CommandOrControl+Shift+Space", () => {
    mainWindow?.webContents.send("ren:activate-voice");
  });
  app.once("will-quit", () => globalShortcut.unregisterAll());
  ipcMain.handle("ren:voice-shortcut-available", (event) => event.sender === mainWindow?.webContents && voiceShortcutActive);
  ipcMain.handle("ren:voice-mode", (event) => event.sender === mainWindow?.webContents ? voiceMode() : { paused: true, alwaysOn: false });
  ipcMain.handle("ren:voice-stop-conversation", (event) => {
    requireMainRenderer(event);
    if (alwaysOnVoice) setAlwaysOnVoice(false);
    return voiceMode();
  });
  ipcMain.handle("ren:job-start", async (event, input: unknown) => {
    requireMainRenderer(event);
    if (voicePaused) throw new Error("Ren is paused. Resume it before starting a job.");
    const pauseEpoch = voicePauseEpoch;
    const jobInput = consumeAgentJobCapture(input, lastCaptureData, captureSession);
    lastCaptureData = null;
    const credentials = await visionCredentials();
    if (voicePaused || pauseEpoch !== voicePauseEpoch) throw new Error("Ren was paused before the job started.");
    return agentJobs.start(jobInput, credentials);
  });
  ipcMain.handle("ren:job-cancel", (event, id: unknown) => {
    requireMainRenderer(event);
    if (typeof id !== "string") return false;
    return agentJobs.cancel(id);
  });
  let lastOrbitPointer = "";
  const orbitCursorTimer = setInterval(() => {
    const visual = lastVisualLesson;
    if (!visual || visual.lesson.layout !== "centered" || !overlayWindow?.isVisible()) return;
    const display = screen.getAllDisplays().find((item) => item.id === visual.displayId);
    if (!display) return;
    const pointer = normalizeCursor(screen.getCursorScreenPoint(), display.bounds);
    const key = `${Math.round(pointer.x * 200)},${Math.round(pointer.y * 200)}`;
    if (key === lastOrbitPointer) return;
    lastOrbitPointer = key;
    overlayWindow.webContents.send("ren:orbit-pointer", pointer);
  }, 33);
  app.once("before-quit", () => clearInterval(orbitCursorTimer));
  function showFocusPath(displayId: number, points: FocusRegion["points"]) {
    const display = screen.getAllDisplays().find((item) => item.id === displayId);
    if (!display || !overlayWindow) return;
    const firstProgress = !focusOverlaySnapshot;
    if (firstProgress) focusOverlaySnapshot = {
      annotations: overlayAnnotations,
      lesson: overlayLesson,
      illustration: overlayIllustration,
      visual: lastVisualLesson,
      bounds: overlayWindow.getBounds(),
      visible: overlayWindow.isVisible(),
      generation: visualGeneration,
    };
    captureSession.invalidate();
    lastCaptureData = null;
    const annotatingCurrentVisual = lastVisualLesson?.displayId === displayId;
    if (firstProgress && !annotatingCurrentVisual) {
      sendOverlayLesson(null);
    }
    overlayWindow.setBounds(display.bounds);
    sendOverlayAnnotations([{ id: "circle-focus", type: "path", points, color: "#327d87" }]);
    overlayWindow.showInactive();
  }
  function cancelFocusPath() {
    selectedFocus = null;
    if (!overlayWindow) return;
    const snapshot = focusOverlaySnapshot;
    focusOverlaySnapshot = null;
    if (!snapshot) return;
    if (snapshot.generation !== visualGeneration) return;
    lastVisualLesson = snapshot.visual;
    overlayWindow.setBounds(snapshot.bounds);
    if (overlayLesson !== snapshot.lesson) sendOverlayLesson(snapshot.lesson);
    if (overlayIllustration !== snapshot.illustration) sendOverlayIllustration(snapshot.illustration);
    sendOverlayAnnotations(snapshot.annotations);
    if (snapshot.visible) overlayWindow.showInactive();
    else overlayWindow.hide();
  }
  function completeFocusPath(displayId: number) {
    if (lastVisualLesson && lastVisualLesson.displayId !== displayId) {
      visualGeneration += 1;
      imageRenderAbort?.abort();
      imageRenderAbort = null;
      lastVisualLesson = null;
      sendOverlayIllustration(null);
    }
    focusOverlaySnapshot = null;
  }
  function invalidateSpatialContext() {
    focusOverlaySnapshot = null;
    userSketch = null;
    visualGeneration += 1;
    pendingVisualDecision = false;
    imageRenderAbort?.abort();
    imageRenderAbort = null;
    selectedFocus = null;
    captureSession.invalidate();
    lastCaptureData = null;
    lastVisualLesson = null;
    sendOverlayAnnotations([]);
    sendOverlayLesson(null);
    sendOverlayIllustration(null);
    overlayWindow?.hide();
  }
  screen.on("display-removed", () => {
    invalidateSpatialContext();
    repositionMainWindow();
  });
  screen.on("display-metrics-changed", invalidateSpatialContext);
  function enableCircleInput() {
    if (process.platform === "darwin" && !systemPreferences.isTrustedAccessibilityClient(false)) return false;
    circleInputActive = startCircleInput({
      onTripleControl: () => {
        if (voicePaused) setVoicePaused(false);
        mainWindow?.webContents.send("ren:activate-voice");
      },
      onSketchProgress: (displayId, points) => { if (!voicePaused) showFocusPath(displayId, points); },
      onSketchComplete: (displayId, points) => {
        if (voicePaused) return;
        userSketch = { displayId, points };
        const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
        const x = Math.max(0, Math.min(...xs) - .015), y = Math.max(0, Math.min(...ys) - .015);
        const right = Math.min(1, Math.max(...xs) + .015), bottom = Math.min(1, Math.max(...ys) + .015);
        selectedFocus = { displayId, region: { points, bounds: { x, y, width: right - x, height: bottom - y } }, createdAt: Date.now() };
        showFocusPath(displayId, points);
        completeFocusPath(displayId);
        mainWindow?.webContents.send("ren:focus-selection", "sketch");
      },
      onSketchCancel: cancelFocusPath,
      onProgress: (displayId, points) => { if (!voicePaused) showFocusPath(displayId, points); },
      onComplete: (displayId, region) => {
        if (voicePaused) return;
        selectedFocus = { displayId, region, createdAt: Date.now() };
        showFocusPath(displayId, region.points);
        completeFocusPath(displayId);
        repositionMainWindow(displayId);
        mainWindow?.webContents.send("ren:focus-selection", "circle");
      },
      onCancel: cancelFocusPath,
      onScroll: () => {
        // A spoken request may arrive while the user is still browsing. Keep
        // the captured frame for the answer; fresh-frame checks below decide
        // whether any spatial guidance is still safe to draw.
      },
    });
    return circleInputActive;
  }
  // Voice activation must remain available even if screen capture is denied.
  enableCircleInput();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media" && webContents === mainWindow?.webContents);
  });

  ipcMain.handle("ren:permission-status", (event) => {
    requireMainRenderer(event);
    if (!permissionRequest && !circleInputActive && (process.platform !== "darwin" || systemPreferences.isTrustedAccessibilityClient(false))) enableCircleInput();
    return permissionStatus();
  });
  ipcMain.handle("ren:vision-status", (event) => event.sender === mainWindow?.webContents ? visionStatus() : null);
  ipcMain.handle("ren:vision-save", (event, value: unknown) => {
    if (event.sender !== mainWindow?.webContents) throw new Error("Not allowed");
    return saveVisionSettings(value);
  });
  ipcMain.handle("ren:vision-clear", (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error("Not allowed");
    return clearVisionSettings();
  });
  ipcMain.handle("ren:image-service-status", (event) => event.sender === mainWindow?.webContents ? hostedImageStatus() : null);
  ipcMain.handle("ren:image-service-save", (event, value: unknown) => {
    requireMainRenderer(event);
    return saveHostedImageSettings(value);
  });
  ipcMain.handle("ren:image-service-clear", (event) => {
    requireMainRenderer(event);
    return clearHostedImageSettings();
  });
  ipcMain.handle("ren:enable-circle-input", (event) => {
    if (event.sender !== mainWindow?.webContents) return permissionStatus();
    if (process.platform === "darwin") systemPreferences.isTrustedAccessibilityClient(true);
    enableCircleInput();
    return permissionStatus();
  });
  ipcMain.handle("ren:wake-available", () => wakeAvailable());
  ipcMain.handle("ren:wake-start", (event, sampleRate: unknown) => !voicePaused && event.sender === mainWindow?.webContents && typeof sampleRate === "number" && startWake(sampleRate));
  ipcMain.handle("ren:wake-feed", (event, samples: unknown) => !voicePaused && event.sender === mainWindow?.webContents && feedWake(samples));
  ipcMain.handle("ren:wake-stop", (event) => { if (event.sender === mainWindow?.webContents) stopWake(); });
  ipcMain.handle("ren:speech-available", (event) => event.sender === mainWindow?.webContents && speechAvailable());
  ipcMain.handle("ren:speech-start", (event, sampleRate: unknown) => !voicePaused && event.sender === mainWindow?.webContents && typeof sampleRate === "number" && startSpeech(sampleRate, (input) => {
    if (!event.sender.isDestroyed()) event.sender.send("ren:speech-input", input);
  }));
  ipcMain.handle("ren:speech-feed", (event, samples: unknown) => !voicePaused && event.sender === mainWindow?.webContents && feedSpeech(samples));
  ipcMain.handle("ren:speech-finish", (event) => !voicePaused && event.sender === mainWindow?.webContents ? finishSpeech() : "");
  ipcMain.handle("ren:speech-stop", (event) => event.sender === mainWindow?.webContents ? stopSpeech() : undefined);
  ipcMain.handle("ren:deepgram-status", (event) => { requireMainRenderer(event); return deepgramStatus(); });
  ipcMain.handle("ren:deepgram-save", (event, value: unknown) => { requireMainRenderer(event); return saveDeepgramKey(value); });
  ipcMain.handle("ren:deepgram-clear", (event) => { requireMainRenderer(event); return clearDeepgramKey(); });
  ipcMain.handle("ren:speak", (event, id: unknown, value: unknown) => {
    requireMainRenderer(event);
    if (voicePaused) throw new Error("Ren is paused.");
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid speech request.");
    const sender = event.sender;
    const controller = new AbortController();
    speechOutputControllers.set(id, controller);
    void streamWithDeepgram(value, (chunk) => {
      if (!controller.signal.aborted && !sender.isDestroyed()) sender.send("ren:speech-data", { id, chunk: Buffer.from(chunk).toString("base64") });
    }, controller.signal).then(() => {
      if (!sender.isDestroyed()) sender.send("ren:speech-data", { id, done: true });
    }).catch((reason: unknown) => {
      if (!sender.isDestroyed()) sender.send("ren:speech-data", { id, error: reason instanceof Error ? reason.message : "Deepgram speech failed." });
    }).finally(() => { if (speechOutputControllers.get(id) === controller) speechOutputControllers.delete(id); });
    return true;
  });
  ipcMain.handle("ren:speak-cancel", (event, id: unknown) => {
    requireMainRenderer(event);
    if (typeof id !== "string") return false;
    const controller = speechOutputControllers.get(id);
    if (!controller) return false;
    controller.abort();
    speechOutputControllers.delete(id);
    return true;
  });
  ipcMain.handle("ren:ask-cancel", (event, contextToken: unknown) => {
    requireMainRenderer(event);
    const result = cancelActiveAsk(contextToken, activeAskRequest, captureSession);
    if (result.invalidatedCapture) {
      visualGeneration += 1;
      overlayWindow?.hide();
    }
    return result.cancelled;
  });
  ipcMain.handle("ren:request-permissions", (event) => {
    requireMainRenderer(event);
    if (permissionRequest) return permissionRequest;
    permissionRequest = (async () => {
      const wasOnTop = mainWindow?.isAlwaysOnTop() ?? false;
      if (wasOnTop) mainWindow?.setAlwaysOnTop(false);
      try {
        if (process.platform === "darwin") await systemPreferences.askForMediaAccess("microphone");
        // Screen and microphone are independent permissions. A refused screen
        // request must never prevent the microphone prompt from appearing.
        if (process.platform === "darwin") await requestMacScreenCaptureAccess();
        await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 320, height: 180 } });
        if (process.platform === "darwin") systemPreferences.isTrustedAccessibilityClient(true);
        const access = permissionStatus();
        const canComplete = process.platform !== "darwin" || access.screen === "granted";
        if (canComplete) writeFileSync(onboardingMarkerPath(), new Date().toISOString(), { encoding: "utf8", mode: 0o600 });
        if (permissionStatus().ready) {
          if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
        }
        enableCircleInput();
        return permissionStatus();
      } finally {
        if (wasOnTop) mainWindow?.setAlwaysOnTop(true, "screen-saver");
      }
    })().finally(() => { permissionRequest = null; });
    return permissionRequest;
  });
  ipcMain.handle("ren:open-permission-settings", async (event, kind: unknown) => {
    requireMainRenderer(event);
    if (process.platform === "darwin") await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${kind === "microphone" ? "Privacy_Microphone" : "Privacy_ScreenCapture"}`);
  });
  ipcMain.handle("ren:set-expanded", (event, expanded: unknown) => {
    requireMainRenderer(event);
    positionMainWindow(expanded === true);
    if (expanded === true) mainWindow?.showInactive();
  });
  ipcMain.handle("ren:set-companion-visible", (event, visible: unknown) => {
    requireMainRenderer(event);
    if (visible === true) mainWindow?.showInactive();
    else if (visible === false) mainWindow?.hide();
  });

  ipcMain.handle("ren:list-sources", async (event) => {
    requireMainRenderer(event);
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } });
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
  });
  ipcMain.handle("ren:primary-source", async (event) => {
    requireMainRenderer(event);
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 320, height: 180 } });
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const source = sources.find((candidate) => candidate.display_id === String(cursorDisplay.id)) ?? sources[0];
    if (!source) throw new Error("No display source is available");
    return { id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() };
  });
  ipcMain.handle("ren:capture-context", async (event, keepVisual: unknown, question: unknown) => {
    requireMainRenderer(event);
    if (voicePaused) throw new Error("Ren is paused. Resume it before asking.");
    if (screenCaptureBusy) throw new Error("Ren is already capturing the screen. Try again.");
    screenCaptureBusy = true;
    const generation = ++visualGeneration;
    const { display, pointer } = cursorDisplayContext();
    const preservedVisual = keepVisual === true && lastVisualLesson?.displayId === display.id ? lastVisualLesson : null;
    const showDuringAnswer = preservedVisual && typeof question === "string" && question.length <= 5000
      && likelyVisualFollowUp(question, preservedVisual.lesson.title, preservedVisual.lesson.parts.map((part) => part.label));
    pendingVisualDecision = Boolean(preservedVisual);
    const focus = selectedFocus && selectedFocus.displayId === display.id && Date.now() - selectedFocus.createdAt < 30_000 ? selectedFocus.region : null;
    selectedFocus = null;
    lastCaptureData = null;
    if (!preservedVisual) { imageRenderAbort?.abort(); imageRenderAbort = null; }
    const contextToken = captureSession.issue(display.id);
    mainWindow?.setOpacity(0);
    if (!preservedVisual) {
      sendOverlayAnnotations([]);
      sendOverlayLesson(null);
      sendOverlayIllustration(null);
    }
    overlayWindow?.hide();
    await new Promise((resolve) => setTimeout(resolve, 90));
    try {
      const aspectRatio = display.size.width / display.size.height;
      const thumbnailSize = aspectRatio >= 1 ? { width: 1600, height: Math.round(1600 / aspectRatio) } : { width: Math.round(1200 * aspectRatio), height: 1200 };
      const capture = () => captureDisplay(display.id, thumbnailSize);
      const encodeMotion = (image: Electron.NativeImage) => `data:image/jpeg;base64,${image.toJPEG(82).toString("base64")}`;
      const first = await capture();
      if (!first) throw new Error("The display under your cursor could not be captured");
      const frames = [first.toDataURL()];
      if (focus) {
        const size = first.getSize();
        const crop = {
          x: Math.floor(focus.bounds.x * size.width), y: Math.floor(focus.bounds.y * size.height),
          width: Math.max(1, Math.floor(focus.bounds.width * size.width)),
          height: Math.max(1, Math.floor(focus.bounds.height * size.height)),
        };
        frames.push(first.crop(crop).toDataURL());
      }
      await new Promise((resolve) => setTimeout(resolve, 130));
      const second = await capture();
      if (second && hasMeaningfulMotion(motionSample(first), motionSample(second))) {
        frames.push(encodeMotion(second));
        if (!focus) {
          await new Promise((resolve) => setTimeout(resolve, 130));
          const third = await capture();
          if (third && hasMeaningfulMotion(motionSample(second), motionSample(third))) frames.push(encodeMotion(third));
        }
      }
      if (!captureSession.isCurrent(contextToken)) throw new Error("The screen changed during capture. Ask again.");
      lastCaptureData = { token: contextToken, generation, frames, pointer, focus: focus?.bounds, firstSample: motionSample(first), secondSample: motionSample(second ?? first), dynamicContent: !!second && hasMeaningfulMotion(motionSample(first), motionSample(second)), thumbnailSize };
      setTimeout(() => {
        if (lastCaptureData?.token === contextToken) { lastCaptureData = null; captureSession.invalidate(); pendingVisualDecision = false; }
      }, 90_000).unref();
      overlayWindow?.setBounds(display.bounds);
      return { frames: [], pointer, focus: focus?.bounds, contextToken };
    } catch (error) {
      pendingVisualDecision = false;
      if (captureSession.isCurrent(contextToken)) captureSession.invalidate();
      if (preservedVisual && lastVisualLesson === preservedVisual && generation === visualGeneration) overlayWindow?.showInactive();
      throw error;
    } finally {
      mainWindow?.setOpacity(1);
      if (lastCaptureData?.token === contextToken && showDuringAnswer && lastVisualLesson === preservedVisual && generation === visualGeneration) overlayWindow?.showInactive();
      screenCaptureBusy = false;
    }
  });

  ipcMain.handle("ren:ask", async (event, request: unknown) => {
    requireMainRenderer(event);
    if (voicePaused) throw new Error("Ren is paused. Resume it before asking.");
    const value = parseAskRequest(request);
    const guidedCadTask = wantsToDelegateCurrentTask(value.question)
      ? value.history.find((turn) => turn.role === "user" && wantsGuidedWorkflow(turn.content)
        && /\b(?:cad|freecad|parametric)\b/i.test(turn.content)
        && !/\b(?:fea|fem|finite.element|simulation|solver|analysis)\b/i.test(turn.content))?.content
      : undefined;
    const cadRequest = guidedCadTask ? `Create a CAD model for this task: ${guidedCadTask}` : value.question;
    if (guidedCadTask || wantsCadCreation(cadRequest)) {
      if (!value.contextToken) throw new Error("Invalid CAD request.");
      const captured = lastCaptureData?.token === value.contextToken ? lastCaptureData : null;
      if (wantsCurrentScreen(value.question, value.history) && !captured) throw new Error("Screen context expired. Ask again.");
      if (captured) {
        captureSession.consume(value.contextToken);
        lastCaptureData = null;
      }
      const controller = new AbortController();
      activeAskRequest = { token: value.contextToken, controller };
      try {
        const credentials = await visionCredentials();
        if (!credentials) throw new Error("Connect a vision model in Ren settings to create a CAD model.");
        const spec = await planCadModel(cadRequest, credentials, captured?.frames ?? [], controller.signal);
        if (controller.signal.aborted || voicePaused) throw new Error("The CAD request was cancelled.");
        const script = app.isPackaged ? join(process.resourcesPath, "freecad-create.py") : join(currentDirectory, "..", "scripts", "freecad-create.py");
        const output = await createFreeCadModel(spec, join(app.getPath("documents"), "Ren CAD Models"), script, undefined, controller.signal);
        if (controller.signal.aborted || voicePaused) throw new Error("The CAD request was cancelled. A new model file may have been saved.");
        const openError = await shell.openPath(output);
        const assumptions = spec.assumptions.length ? ` Assumed: ${spec.assumptions.slice(0, 3).join("; ")}.` : "";
        return { answer: `I created an editable FreeCAD model named ${spec.title}.${openError ? ` I saved it at ${output}, but could not open it: ${openError}.` : " It is open in FreeCAD."}${assumptions} Check the dimensions and fit before using it for fabrication or analysis.`, annotations: [], followUps: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false, provider: "vision" as const };
      } finally {
        if (activeAskRequest?.controller === controller) activeAskRequest = null;
      }
    }
    if (wantsComputerExecution(value.question, value.history)) {
      if (computerOperatorBusy) throw new Error("Ren is already working in an app.");
      if (!value.contextToken) throw new Error("Invalid screen action request.");
      const captured = lastCaptureData?.token === value.contextToken ? lastCaptureData : null;
      if (!captured?.frames[0]) throw new Error("Screen context expired. Ask again.");
      const displayId = captureSession.consume(value.contextToken);
      lastCaptureData = null;
      const display = screen.getAllDisplays().find((item) => item.id === displayId);
      if (!display) throw new Error("The display changed. Ask again.");
      if (process.platform !== "darwin") throw new Error("App control is currently available on macOS only.");
      if (!systemPreferences.isTrustedAccessibilityClient(false)) throw new Error("Enable Accessibility for Ren in macOS Settings to let it click and type in other apps.");
      const credentials = await visionCredentials();
      if (!credentials) throw new Error("Connect a vision model in Ren settings to operate another app.");
      const originalTask = wantsToDelegateCurrentTask(value.question)
        ? value.history.find((turn) => turn.role === "user" && wantsGuidedWorkflow(turn.content))?.content
        : undefined;
      if (wantsToDelegateCurrentTask(value.question) && !originalTask) return { answer: "Tell me which task you want me to do in the visible app.", annotations: [], followUps: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false, provider: "vision" as const };
      const task = originalTask ? `${originalTask}\nThe user now asks Ren to do this task for them.` : value.question;
      const controller = new AbortController();
      activeAskRequest = { token: value.contextToken, controller };
      computerOperatorBusy = true;
      const mainWasVisible = Boolean(mainWindow?.isVisible());
      mainWindow?.hide();
      overlayWindow?.hide();
      const script = app.isPackaged ? join(process.resourcesPath, "ren-input.swift") : join(currentDirectory, "..", "scripts", "ren-input.swift");
      let image = captured.frames[0];
      let firstSample = captured.firstSample;
      let secondSample = captured.secondSample;
      const actions: ComputerAction[] = [];
      let unchanged = 0;
      let waits = 0;
      let replans = 0;
      try {
        await new Promise((resolve) => setTimeout(resolve, 160));
        const targetApp = await readComputerTarget(script, task, display.bounds, controller.signal);
        await activateComputerTarget(script, targetApp, display.bounds, controller.signal);
        const initialScreen = await captureDisplay(displayId, captured.thumbnailSize);
        if (!initialScreen) throw new Error("Ren could not view the requested app after bringing it forward.");
        image = initialScreen.toDataURL();
        firstSample = motionSample(initialScreen);
        await new Promise((resolve) => setTimeout(resolve, 120));
        secondSample = motionSample(await captureDisplay(displayId, captured.thumbnailSize) ?? initialScreen);
        for (let step = 0; step < 24; step++) {
          if (controller.signal.aborted || voicePaused) throw new Error("Ren stopped operating the app.");
          if (!screen.getAllDisplays().some((item) => item.id === displayId && JSON.stringify(item.bounds) === JSON.stringify(display.bounds))) throw new Error("The display changed during this task.");
          const action = await planComputerAction(task, image, actions, credentials, controller.signal);
          await activateComputerTarget(script, targetApp, display.bounds, controller.signal);
          const beforeAction = await captureDisplay(displayId, captured.thumbnailSize);
          if (!beforeAction) throw new Error("Ren could not recheck the screen before acting.");
          if (!isSameStableScreen(firstSample, secondSample, motionSample(beforeAction))) {
            if (++replans > 2) throw new Error("The screen changed while Ren was choosing an action, so it stopped.");
            image = beforeAction.toDataURL();
            firstSample = motionSample(beforeAction);
            await new Promise((resolve) => setTimeout(resolve, 120));
            secondSample = motionSample(await captureDisplay(displayId, captured.thumbnailSize) ?? beforeAction);
            continue;
          }
          replans = 0;
          if (action.action === "done") return { answer: action.summary || "The requested task is complete on screen.", annotations: [], followUps: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false, provider: "vision" as const };
          if (action.action === "blocked") return { answer: `I stopped here: ${action.reason}`, annotations: [], followUps: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false, provider: "vision" as const };
          if (JSON.stringify(actions.at(-1)) === JSON.stringify(action) && JSON.stringify(actions.at(-2)) === JSON.stringify(action)) throw new Error("Ren repeated the same screen action without progress, so it stopped.");
          if (action.action === "wait") {
            if (++waits > 3) throw new Error("The app did not become ready, so Ren stopped.");
            await new Promise((resolve) => setTimeout(resolve, 800));
          } else {
            waits = 0;
            await performComputerAction(action, display.bounds, script, targetApp, controller.signal);
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
          actions.push(action);
          const next = await captureDisplay(displayId, captured.thumbnailSize);
          if (!next) throw new Error("Ren could not verify the screen after acting.");
          const nextImage = next.toDataURL();
          unchanged = nextImage === image ? unchanged + 1 : 0;
          if (unchanged >= 3) throw new Error("The screen did not change after Ren's actions, so it stopped.");
          image = nextImage;
          firstSample = motionSample(next);
          await new Promise((resolve) => setTimeout(resolve, 120));
          secondSample = motionSample(await captureDisplay(displayId, captured.thumbnailSize) ?? next);
        }
        return { answer: "I stopped after 24 screen actions. The task may be unfinished; I did not assume the remaining steps succeeded.", annotations: [], followUps: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false, provider: "vision" as const };
      } finally {
        computerOperatorBusy = false;
        if (activeAskRequest?.controller === controller) activeAskRequest = null;
        if (mainWasVisible && !voicePaused) mainWindow?.showInactive();
      }
    }
    const useScreen = wantsCurrentScreen(value.question, value.history);
    if (!useScreen) {
      if (!value.contextToken) throw new Error("Invalid conversation request.");
      const askController = new AbortController();
      activeAskRequest = { token: value.contextToken, controller: askController };
      overlayWindow?.hide();
      try {
        const response = await askTeacher({ question: value.question, frames: [], history: value.history }, await visionCredentials(), askController.signal);
        if (askController.signal.aborted || voicePaused) throw new Error("Ren is paused or the request was cancelled.");
        return { ...response, annotations: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false };
      } finally {
        if (activeAskRequest?.controller === askController) activeAskRequest = null;
      }
    }
    const capture = lastCaptureData;
    if (!value.contextToken || !capture || capture.token !== value.contextToken) throw new Error("Screen context expired. Ask again.");
    const displayId = captureSession.consume(value.contextToken);
    lastCaptureData = null;
    const askController = new AbortController();
    activeAskRequest = { token: value.contextToken, controller: askController };
    try {
    const pointer = capture.pointer;
    const focus = capture.focus;
    const focusHint = focus
      ? ` The learner marked the area (${focus.x.toFixed(3)}, ${focus.y.toFixed(3)}, ${focus.width.toFixed(3)}, ${focus.height.toFixed(3)}); the second image is a close crop of it. Prioritize what is inside the marked area.` : "";
    const pointedQuestion = useScreen ? `${value.question}\n\n[The learner is pointing with their cursor at normalized screen coordinate (${pointer.x.toFixed(3)}, ${pointer.y.toFixed(3)}). Use that as a spatial hint, not an instruction.${focusHint}]` : value.question;
    const priorVisualLesson = useScreen && lastVisualLesson && lastVisualLesson.displayId === displayId
      && (overlayWindow?.isVisible() || Date.now() - lastVisualLesson.createdAt < 300_000) ? lastVisualLesson.lesson : undefined;
    const priorAssemblyGuide = Boolean(priorVisualLesson?.dimension === 3 && wantsPriorAssemblyGuide(value.question));
    const transformPriorVisual = Boolean(priorVisualLesson && (wantsPriorVisualIn3D(value.question) || priorAssemblyGuide));
    const explicitVisual = wantsVisualCreation(value.question) || transformPriorVisual;
    const credentials = await visionCredentials();
    const directImageAvailable = Boolean(credentials && new URL(credentials.baseUrl).origin === "https://api.openai.com");
    const hostedImageAvailable = directImageAvailable ? false : Boolean(await hostedImageCredentials().catch(() => null));
    if (askController.signal.aborted || voicePaused) throw new Error("Ren is paused or the request was cancelled.");
    const response = await askTeacher({ question: pointedQuestion, frames: useScreen ? capture.frames : [], history: value.history, priorVisualLesson, transformPriorVisual }, credentials, askController.signal);
    if (askController.signal.aborted || voicePaused) throw new Error("Ren is paused or the request was cancelled.");
    if (capture.generation !== visualGeneration) return { ...response, annotations: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false };
    const display = screen.getAllDisplays().find((item) => item.id === displayId);
    // The answer describes the captured image and remains useful if the user
    // moves the pointer or changes apps while OpenAI is responding. Only the
    // spatial overlay needs the original display and a stable screen.
    const spatialAllowed = Boolean(useScreen && display && captureSession.isCurrent(value.contextToken)
      && screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id === displayId
      && canPlaceSpatialVisual(capture.dynamicContent, circleInputActive));
    const reuseVisual = Boolean(priorVisualLesson && !explicitVisual && response.retainVisual && !response.visualLesson && lastVisualLesson?.lesson === priorVisualLesson);
    if (!reuseVisual) { imageRenderAbort?.abort(); imageRenderAbort = null; }
    let lesson = reuseVisual ? priorVisualLesson! : !explicitVisual ? null : transformPriorVisual && priorVisualLesson ? priorVisualLesson : display && (spatialAllowed || explicitVisual) ? validateVisualLesson(response.visualLesson) : null;
    let referenceImage: string | undefined;
    if (lesson && explicitVisual && wantsReferenceRecreation(value.question)) {
      const bounds = response.referenceRegion ?? focus;
      if (bounds) {
        const first = nativeImage.createFromDataURL(capture.frames[0]);
        const size = first.getSize();
        const rect = {
          x: Math.floor(bounds.x * size.width), y: Math.floor(bounds.y * size.height),
          width: Math.max(1, Math.floor(bounds.width * size.width)),
          height: Math.max(1, Math.floor(bounds.height * size.height)),
        };
        const cropped = first.crop(rect);
        if (!cropped.isEmpty()) {
          const cropSize = cropped.getSize();
          const image = Math.max(cropSize.width, cropSize.height) > 1024
            ? cropped.resize({ width: Math.round(cropSize.width * 1024 / Math.max(cropSize.width, cropSize.height)) }) : cropped;
          const dataUrl = image.toDataURL();
          if (dataUrl.length < 10_000_000) referenceImage = dataUrl;
        }
      }
    }
    if (lesson && explicitVisual && display) {
      const dimension = priorAssemblyGuide ? 3 : requestedVisualDimension(value.question);
      lesson = { ...lesson, dimension, playAssembly: priorAssemblyGuide || wantsAssemblyAnimation(value.question) };
      lesson = tagRequestedInteractiveScene(lesson, value.question);
      if (dimension === 3 && (!interactiveSceneFor(lesson) || ((priorAssemblyGuide || wantsAssemblySequence(value.question)) && !lesson.model?.assembly)) && credentials) {
        // Keep the overlay hidden until geometry and labels are ready together.
        try {
          const modelQuestion = priorAssemblyGuide ? `Animate assembling ${lesson.title}. ${value.question}` : value.question;
          const model = await generateSceneSpec(lesson, modelQuestion, credentials, askController.signal, fetch, referenceImage);
          lesson = { ...lesson, model };
        } catch (error) {
          if (askController.signal.aborted || voicePaused) throw error;
          const reason = error instanceof Error ? error.message : "The model planner failed.";
          if (referenceImage && directImageAvailable) {
            response.answer = `I couldn't build a reliable rotatable 3D model of ${lesson.title} right now. ${reason} I'll show a reference-guided illustration instead.`;
            lesson = { ...lesson, model: undefined, playAssembly: false };
          } else {
            response.answer = `I couldn't build a reliable rotatable 3D model of ${lesson.title} right now. ${reason}`;
            lesson = null;
          }
        }
      }
      if (lesson) lesson = centerRequestedLesson({ ...lesson, ...(referenceImage ? { referenceImage } : {}) }, display.bounds.width, display.bounds.height);
    }
    let annotations = spatialAllowed && (focus || wantsSpatialGuidance(value.question)) && !explicitVisual && !reuseVisual ? response.annotations : [];
    if (spatialAllowed && focus && !explicitVisual && !reuseVisual) {
      annotations = [{ id: "selected-area", type: "rectangle" as const, at: { x: focus.x, y: focus.y }, width: focus.width, height: focus.height, color: "#42c7d9", label: "Selected area" }, ...annotations.filter((item) => item.type !== "rectangle")].slice(0, 4);
    }
    if (annotations.length || (lesson && lesson.layout !== "centered" && !reuseVisual)) {
      if (screenCaptureBusy) { lesson = null; annotations = []; }
      else {
        screenCaptureBusy = true;
        mainWindow?.setOpacity(0);
        overlayWindow?.hide();
        try {
          await new Promise((resolve) => setTimeout(resolve, 60));
          const fresh = await captureDisplay(displayId, capture.thumbnailSize);
          if (!fresh || !isSameStableScreen(capture.firstSample, capture.secondSample, motionSample(fresh))
            || !captureSession.isCurrent(value.contextToken)
            || screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id !== displayId) {
            lesson = null; annotations = [];
          }
        } catch { lesson = null; annotations = []; }
        finally { mainWindow?.setOpacity(1); screenCaptureBusy = false; }
      }
    }
    if (capture.generation !== visualGeneration) return { ...response, annotations: [], visualLesson: undefined, reusedVisual: false, autoIllustrate: false };
    if (display) overlayWindow?.setBounds(display.bounds);
    const autoIllustrate = Boolean(lesson && explicitVisual && (
      (!interactiveSceneFor(lesson) && (directImageAvailable || hostedImageAvailable))
      || (lesson.model && referenceImage && directImageAvailable)));
    if (!reuseVisual) {
      const sketch = userSketch;
      sendOverlayAnnotations(sketch && sketch.displayId === display?.id
        ? [{ id: "user-sketch", type: "path", points: sketch.points, color: "#327d87" }, ...annotations] : annotations);
      sendOverlayLesson(autoIllustrate && lesson && !lesson.model ? { ...lesson, pendingIllustration: true } : lesson);
      sendOverlayIllustration(null);
    }
    if (annotations.length || lesson) overlayWindow?.showInactive();
    else overlayWindow?.hide();
    if (reuseVisual && lastVisualLesson) lastVisualLesson.createdAt = Date.now();
    else lastVisualLesson = lesson ? { lesson, displayId, createdAt: Date.now(), referenceImage } : null;
    return { ...response, answer: lesson ? answerForInteractiveScene(response.answer, lesson) : response.answer, annotations, visualLesson: reuseVisual ? undefined : lesson ?? undefined, reusedVisual: reuseVisual, autoIllustrate };
    } catch (error) {
      if (pendingVisualDecision && lastVisualLesson && capture.generation === visualGeneration) overlayWindow?.showInactive();
      throw error;
    } finally {
      if (activeAskRequest?.controller === askController) activeAskRequest = null;
      pendingVisualDecision = false;
    }
  });
  ipcMain.handle("ren:generate-illustration", async (event, automatic: unknown) => {
    requireMainRenderer(event);
    if (voicePaused) throw new Error("Ren is paused. Resume it before drawing.");
    const pauseEpoch = voicePauseEpoch;
    const visual = lastVisualLesson;
    if (!visual) throw new Error("A current visual lesson is required.");
    const revealFallback = () => {
      if (automatic === true && lastVisualLesson === visual) sendOverlayLesson(visual.lesson);
    };
    if (imageRequestBusy || imageRenderAbort) { revealFallback(); throw new Error("An illustration is already rendering."); }
    if (imageRequestedFor === visual.lesson) { revealFallback(); throw new Error("This lesson already requested an image. Ask a new question to create another."); }
    imageRequestBusy = true;
    try {
      const hosted = await hostedImageCredentials();
      const credentials = hosted ? null : await visionCredentials();
      if (voicePaused || pauseEpoch !== voicePauseEpoch) throw new Error("Ren was paused before drawing began.");
      if (!hosted && (!credentials || new URL(credentials.baseUrl).origin !== "https://api.openai.com")) throw new Error("Connect the Ren image service to create an illustration.");
      const detail = hosted
        ? `Ren will send this validated lesson manifest to ${new URL(hosted.baseUrl).host}:\n\n${JSON.stringify(imageManifest(visual.lesson), null, 2)}\n\nThe Ren service uses hosted image and vision models to generate and check the image. No screen screenshot is sent. This request uses your Ren illustration allowance.`
        : `Ren will send this screen-derived lesson text${visual.referenceImage ? " and a tight crop of the requested object" : ""} to OpenAI:\n\n${imagePrompt(visual.lesson, Boolean(visual.referenceImage))}\n\nThe generated image is sent to your configured vision model to check part locations. Both requests may incur provider charges.`;
      if (automatic !== true) {
        const decision = await dialog.showMessageBox(mainWindow!, { type: "question", title: "Create a Ren illustration", message: "Generate an illustration for this lesson?", detail, buttons: ["Cancel", "Generate image"], defaultId: 0, cancelId: 0, noLink: true });
        if (decision.response !== 1) return false;
      }
      if (voicePaused || pauseEpoch !== voicePauseEpoch) throw new Error("Ren was paused before drawing began.");
      if (lastVisualLesson !== visual) throw new Error("The lesson changed before image generation began.");
      imageRequestedFor = visual.lesson;
      const controller = new AbortController();
      imageRenderAbort = controller;
      const timeout = setTimeout(() => controller.abort(), 150_000);
      const current = () => !voicePaused && pauseEpoch === voicePauseEpoch && lastVisualLesson === visual && screen.getAllDisplays().some((display) => display.id === visual.displayId) && !controller.signal.aborted;
      const decoded = (dataUrl: string) => {
        const image = nativeImage.createFromDataURL(dataUrl);
        const size = image.getSize();
        return !image.isEmpty() && size.width > 0 && size.height > 0 && size.width <= 2048 && size.height <= 2048 ? { image, size } : null;
      };
      try {
      // Keep partial image events off screen so the image, labels, and verified
      // pointers arrive as one composition rather than replacing a graph in stages.
      const preview = (_preview: string) => { if (!current()) controller.abort(); };
      const result = hosted
        ? await generateHostedIllustration(visual.lesson, hosted, preview, controller.signal)
        : await (async () => {
          const provider = credentials!;
          const image = await generateIllustration(visual.lesson, provider.apiKey, preview, controller.signal, fetch, visual.referenceImage);
          if (!current()) throw new Error("The screen changed while the illustration was rendering.");
          const registration = await locateImageParts(visual.lesson, image, provider.apiKey, provider.model, controller.signal, fetch, provider.baseUrl).catch(() => null);
          return { image, registration };
        })();
      if (!current()) throw new Error("The screen changed while the illustration was rendering.");
      const checked = decoded(result.image);
      if (!checked) throw new Error("Image provider returned an unreadable image.");
      if (!current()) throw new Error("The screen changed while the illustration was being checked.");
      const visible = result.registration && filterOpaquePositions(checked.image.toBitmap(), checked.size.width, checked.size.height, result.registration);
      const registration = visible && Object.keys(visible).length ? visible : undefined;
      sendOverlayIllustration({ image: result.image, preview: false, width: checked.size.width, height: checked.size.height, registration });
      if (!screenCaptureBusy && !pendingVisualDecision) overlayWindow?.showInactive();
      return true;
      } catch (error) {
        if (lastVisualLesson === visual) sendOverlayIllustration(null);
        if (imageRequestedFor === visual.lesson) imageRequestedFor = null;
        throw error;
      } finally {
        clearTimeout(timeout);
        if (imageRenderAbort === controller) imageRenderAbort = null;
      }
    } catch (error) {
      revealFallback();
      throw error;
    } finally {
      imageRequestBusy = false;
    }
  });
  ipcMain.handle("ren:clear-annotations", (event) => {
    requireMainRenderer(event);
    userSketch = null;
    visualGeneration += 1;
    pendingVisualDecision = false;
    imageRenderAbort?.abort();
    imageRenderAbort = null;
    captureSession.invalidate();
    lastCaptureData = null;
    lastVisualLesson = null;
    sendOverlayAnnotations([]);
    sendOverlayLesson(null);
    sendOverlayIllustration(null);
    overlayWindow?.hide();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else {
      positionMainWindow(false);
      mainWindow?.showInactive();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", stopCircleInput);

