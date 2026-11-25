import "dotenv/config";
import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, nativeImage, screen, session, shell, systemPreferences } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { askTeacher } from "./provider.js";
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
import { generateHostedIllustration } from "./hosted-image-render.js";
import { filterOpaquePositions, locateImageParts } from "./image-registration.js";
import { validateVisualLesson } from "./visual-lesson.js";
import { wantsVisualCreation } from "./visual-intent.js";
import { centerRequestedLesson } from "./visual-presentation.js";
import { answerForInteractiveScene, interactiveSceneFor, tagRequestedInteractiveScene } from "./interactive-scene.js";
import { CaptureSession } from "./capture-session.js";
import { requestMacScreenCaptureAccess } from "./mac-screen-permission.js";
import type { VisualLesson } from "./visual-lesson.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let selectedFocus: { displayId: number; region: FocusRegion; createdAt: number } | null = null;
let circleInputActive = false;
const captureSession = new CaptureSession();
let lastCaptureData: { token: string; frames: string[]; pointer: { x: number; y: number }; focus?: { x: number; y: number; width: number; height: number }; firstSample: Uint8Array; secondSample: Uint8Array; dynamicContent: boolean; thumbnailSize: { width: number; height: number } } | null = null;
let lastVisualLesson: { lesson: VisualLesson; displayId: number; createdAt: number; referenceImage?: string } | null = null;
let screenCaptureBusy = false;
let pendingAnswerToken: string | null = null;
let activeCaptureToken: string | null = null;
let imageRenderAbort: AbortController | null = null;
let imageRequestBusy = false;
let imageRequestedFor: VisualLesson | null = null;
let permissionRequest: Promise<ReturnType<typeof permissionStatus>> | null = null;

const collapsedSize = { width: 236, height: 58 };
const expandedSize = { width: 420, height: 560 };

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
  mainWindow.setBounds({ x: Math.round(workArea.x + (workArea.width - size.width) / 2), y: workArea.y, ...size }, true);
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
    ...expandedSize,
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
    },
  });

  // A floating window falls behind native full-screen Spaces on macOS.
  // Keep the assistant at the same level as its drawing overlay.
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.once("ready-to-show", () => {
    const access = permissionStatus();
    const needsOnboarding = !access.ready || (process.platform === "darwin" && access.microphone !== "granted");
    positionMainWindow(needsOnboarding);
    if (needsOnboarding) mainWindow?.show();
    else mainWindow?.showInactive();
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

app.whenReady().then(() => {
  if (permissionStatus().ready && app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  createMainWindow();
  createOverlayWindow();
  let lastOrbitPointer = "";
  const orbitCursorTimer = setInterval(() => {
    const visual = lastVisualLesson;
    if (!visual || !interactiveSceneFor(visual.lesson) || !overlayWindow?.isVisible()) return;
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
    captureSession.invalidate();
    lastCaptureData = null;
    lastVisualLesson = null;
    overlayWindow.setBounds(display.bounds);
    overlayWindow.webContents.send("ren:visual-lesson", null);
    overlayWindow.webContents.send("ren:annotations", [{ id: "circle-focus", type: "path", points, color: "#327d87" }]);
    overlayWindow.showInactive();
  }
  function invalidateSpatialContext() {
    imageRenderAbort?.abort();
    imageRenderAbort = null;
    selectedFocus = null;
    captureSession.invalidate();
    lastCaptureData = null;
    lastVisualLesson = null;
    overlayWindow?.webContents.send("ren:annotations", []);
    overlayWindow?.webContents.send("ren:visual-lesson", null);
    overlayWindow?.webContents.send("ren:illustration", null);
    overlayWindow?.hide();
  }
  screen.on("display-removed", () => {
    invalidateSpatialContext();
    positionMainWindow(mainWindow?.getBounds().width === expandedSize.width);
  });
  screen.on("display-metrics-changed", invalidateSpatialContext);
  function enableCircleInput() {
    if (process.platform === "darwin" && !systemPreferences.isTrustedAccessibilityClient(false)) return false;
    circleInputActive = startCircleInput({
      onProgress: showFocusPath,
      onComplete: (displayId, region) => {
        selectedFocus = { displayId, region, createdAt: Date.now() };
        showFocusPath(displayId, region.points);
        positionMainWindow(mainWindow?.getBounds().width === expandedSize.width, displayId);
        mainWindow?.showInactive();
        mainWindow?.webContents.send("ren:focus-selection");
      },
      onCancel: invalidateSpatialContext,
      onScroll: () => {
        // The answer can finish against its captured frame. Spatial annotations
        // are checked against the live screen after the answer returns.
        const token = activeCaptureToken;
        if (token && captureSession.isCurrent(token)) captureSession.invalidate();
      },
      onInteraction: () => {
        // Do not cancel an explicitly requested diagram while someone browses.
        const token = activeCaptureToken;
        if (token && captureSession.isCurrent(token)) captureSession.invalidate();
        // A user may keep browsing while an explicitly requested illustration renders.
        // Display removal, a new question, and Clear drawings still cancel it.
      },
    });
    return circleInputActive;
  }
  if (permissionStatus().ready) enableCircleInput();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media" && webContents === mainWindow?.webContents);
  });

  ipcMain.handle("ren:permission-status", (event) => {
    requireMainRenderer(event);
    if (!permissionRequest && permissionStatus().ready && !circleInputActive && (process.platform !== "darwin" || systemPreferences.isTrustedAccessibilityClient(false))) enableCircleInput();
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
  ipcMain.handle("ren:wake-start", (event, sampleRate: unknown) => event.sender === mainWindow?.webContents && typeof sampleRate === "number" && startWake(sampleRate));
  ipcMain.handle("ren:wake-feed", (event, samples: unknown) => event.sender === mainWindow?.webContents && feedWake(samples));
  ipcMain.handle("ren:wake-stop", (event) => { if (event.sender === mainWindow?.webContents) stopWake(); });
  ipcMain.handle("ren:speech-available", (event) => event.sender === mainWindow?.webContents && speechAvailable());
  ipcMain.handle("ren:speech-start", (event, sampleRate: unknown) => event.sender === mainWindow?.webContents && typeof sampleRate === "number" && startSpeech(sampleRate));
  ipcMain.handle("ren:speech-feed", (event, samples: unknown) => event.sender === mainWindow?.webContents && feedSpeech(samples));
  ipcMain.handle("ren:speech-finish", (event) => event.sender === mainWindow?.webContents ? finishSpeech() : "");
  ipcMain.handle("ren:speech-stop", (event) => event.sender === mainWindow?.webContents ? stopSpeech() : undefined);
  ipcMain.handle("ren:deepgram-status", (event) => { requireMainRenderer(event); return deepgramStatus(); });
  ipcMain.handle("ren:deepgram-save", (event, value: unknown) => { requireMainRenderer(event); return saveDeepgramKey(value); });
  ipcMain.handle("ren:deepgram-clear", (event) => { requireMainRenderer(event); return clearDeepgramKey(); });
  ipcMain.handle("ren:speak", (event, id: unknown, value: unknown) => {
    requireMainRenderer(event);
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid speech request.");
    const sender = event.sender;
    void streamWithDeepgram(value, (chunk) => {
      if (!sender.isDestroyed()) sender.send("ren:speech-data", { id, chunk: Buffer.from(chunk).toString("base64") });
    }).then(() => {
      if (!sender.isDestroyed()) sender.send("ren:speech-data", { id, done: true });
    }).catch((reason: unknown) => {
      if (!sender.isDestroyed()) sender.send("ren:speech-data", { id, error: reason instanceof Error ? reason.message : "Deepgram speech failed." });
    });
    return true;
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
          enableCircleInput();
        }
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
  ipcMain.handle("ren:set-expanded", (event, expanded: unknown) => { requireMainRenderer(event); positionMainWindow(expanded === true); });

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
  ipcMain.handle("ren:capture-context", async (event) => {
    requireMainRenderer(event);
    if (screenCaptureBusy) throw new Error("Ren is already capturing the screen. Try again.");
    screenCaptureBusy = true;
    const { display, pointer } = cursorDisplayContext();
    const focus = selectedFocus && selectedFocus.displayId === display.id && Date.now() - selectedFocus.createdAt < 30_000 ? selectedFocus.region : null;
    selectedFocus = null;
    lastCaptureData = null;
    imageRenderAbort?.abort();
    imageRenderAbort = null;
    const contextToken = captureSession.issue(display.id);
    activeCaptureToken = contextToken;
    mainWindow?.setOpacity(0);
    overlayWindow?.webContents.send("ren:annotations", []);
    overlayWindow?.webContents.send("ren:visual-lesson", null);
    overlayWindow?.webContents.send("ren:illustration", null);
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
      lastCaptureData = { token: contextToken, frames, pointer, focus: focus?.bounds, firstSample: motionSample(first), secondSample: motionSample(second ?? first), dynamicContent: !!second && hasMeaningfulMotion(motionSample(first), motionSample(second)), thumbnailSize };
      setTimeout(() => {
        if (lastCaptureData?.token === contextToken) { lastCaptureData = null; captureSession.invalidate(); }
      }, 90_000).unref();
      overlayWindow?.setBounds(display.bounds);
      return { frames: [], pointer, focus: focus?.bounds, contextToken };
    } catch (error) {
      if (captureSession.isCurrent(contextToken)) captureSession.invalidate();
      throw error;
    } finally {
      mainWindow?.setOpacity(1);
      if (activeCaptureToken === contextToken) activeCaptureToken = null;
      screenCaptureBusy = false;
    }
  });

  ipcMain.handle("ren:ask", async (event, request: unknown) => {
    requireMainRenderer(event);
    const value = parseAskRequest(request);
    const capture = lastCaptureData;
    if (!value.contextToken || !capture || capture.token !== value.contextToken) throw new Error("Screen context expired. Ask again.");
    const displayId = captureSession.consume(value.contextToken);
    lastCaptureData = null;
    pendingAnswerToken = value.contextToken;
    try {
    const pointer = capture.pointer;
    const focus = capture.focus;
    const focusHint = focus
      ? ` The learner circled the rectangle (${focus.x.toFixed(3)}, ${focus.y.toFixed(3)}, ${focus.width.toFixed(3)}, ${focus.height.toFixed(3)}); the second image is a close crop of it. Prioritize what is inside the circle.` : "";
    const pointedQuestion = `${value.question}\n\n[The learner is pointing with their cursor at normalized screen coordinate (${pointer.x.toFixed(3)}, ${pointer.y.toFixed(3)}). Use that as a spatial hint, not an instruction.${focusHint}]`;
    const priorVisualLesson = lastVisualLesson && lastVisualLesson.displayId === displayId && Date.now() - lastVisualLesson.createdAt < 300_000 ? lastVisualLesson.lesson : undefined;
    const explicitVisual = wantsVisualCreation(value.question);
    const response = await askTeacher({ question: pointedQuestion, frames: capture.frames, history: value.history, priorVisualLesson }, await visionCredentials());
    const display = screen.getAllDisplays().find((item) => item.id === displayId);
    // The answer describes the captured image and remains useful if the user
    // moves the pointer or changes apps while OpenAI is responding. Only the
    // spatial overlay needs the original display and a stable screen.
    const spatialAllowed = Boolean(display && captureSession.isCurrent(value.contextToken)
      && screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id === displayId
      && canPlaceSpatialVisual(capture.dynamicContent, circleInputActive));
    let lesson = display && (spatialAllowed || explicitVisual) ? validateVisualLesson(response.visualLesson) : null;
    if (lesson && explicitVisual && display) {
      lesson = centerRequestedLesson(lesson, display.bounds.width, display.bounds.height);
      lesson = tagRequestedInteractiveScene(lesson, value.question);
    }
    let annotations = spatialAllowed && !explicitVisual ? response.annotations : [];
    if (spatialAllowed && focus && !explicitVisual) {
      annotations = [{ id: "selected-area", type: "rectangle" as const, at: { x: focus.x, y: focus.y }, width: focus.width, height: focus.height, color: "#42c7d9", label: "Selected area" }, ...annotations.filter((item) => item.type !== "rectangle")].slice(0, 4);
    }
    if (annotations.length || (lesson && lesson.layout !== "centered")) {
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
    if (display) overlayWindow?.setBounds(display.bounds);
    overlayWindow?.webContents.send("ren:annotations", annotations);
    overlayWindow?.webContents.send("ren:visual-lesson", lesson);
    overlayWindow?.webContents.send("ren:illustration", null);
    if (annotations.length || lesson) overlayWindow?.showInactive();
    else overlayWindow?.hide();
    let referenceImage: string | undefined;
    if (lesson && explicitVisual) {
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
    lastVisualLesson = lesson ? { lesson, displayId, createdAt: Date.now(), referenceImage } : null;
    return { ...response, answer: lesson ? answerForInteractiveScene(response.answer, lesson) : response.answer, annotations, visualLesson: lesson ?? undefined, autoIllustrate: Boolean(lesson && explicitVisual && !interactiveSceneFor(lesson)) };
    } finally {
      if (pendingAnswerToken === value.contextToken) pendingAnswerToken = null;
    }
  });
  ipcMain.handle("ren:generate-illustration", async (event, automatic: unknown) => {
    requireMainRenderer(event);
    if (imageRequestBusy || imageRenderAbort) throw new Error("An illustration is already rendering.");
    const visual = lastVisualLesson;
    if (!visual || !circleInputActive) throw new Error("A current visual lesson and pointer permission are required.");
    if (imageRequestedFor === visual.lesson) throw new Error("This lesson already requested an image. Ask a new question to create another.");
    imageRequestBusy = true;
    try {
      const hosted = await hostedImageCredentials();
      const credentials = hosted ? null : await visionCredentials();
      if (!hosted && (!credentials || new URL(credentials.baseUrl).origin !== "https://api.openai.com")) throw new Error("Connect the Ren image service to create an illustration.");
      const detail = hosted
        ? `Ren will send this validated lesson manifest to ${new URL(hosted.baseUrl).host}:\n\n${JSON.stringify(imageManifest(visual.lesson), null, 2)}\n\nThe Ren service uses hosted image and vision models to generate and check the image. No screen screenshot is sent. This request uses your Ren illustration allowance.`
        : `Ren will send this screen-derived lesson text${visual.referenceImage ? " and a tight crop of the requested object" : ""} to OpenAI:\n\n${imagePrompt(visual.lesson, Boolean(visual.referenceImage))}\n\nThe generated image is sent to your configured vision model to check part locations. Both requests may incur provider charges.`;
      if (automatic !== true) {
        const decision = await dialog.showMessageBox(mainWindow!, { type: "question", title: "Create a Ren illustration", message: "Generate an illustration for this lesson?", detail, buttons: ["Cancel", "Generate image"], defaultId: 0, cancelId: 0, noLink: true });
        if (decision.response !== 1) return false;
      }
      if (lastVisualLesson !== visual || !circleInputActive) throw new Error("The lesson changed before image generation began.");
      imageRequestedFor = visual.lesson;
      const controller = new AbortController();
      imageRenderAbort = controller;
      const timeout = setTimeout(() => controller.abort(), 150_000);
      const current = () => lastVisualLesson === visual && screen.getAllDisplays().some((display) => display.id === visual.displayId) && !controller.signal.aborted;
      const decoded = (dataUrl: string) => {
        const image = nativeImage.createFromDataURL(dataUrl);
        const size = image.getSize();
        return !image.isEmpty() && size.width > 0 && size.height > 0 && size.width <= 2048 && size.height <= 2048 ? { image, size } : null;
      };
      try {
      const preview = (preview: string) => {
        if (!current()) { controller.abort(); return; }
        const checked = decoded(preview);
        if (!checked) return;
        overlayWindow?.webContents.send("ren:illustration", { image: preview, preview: true, width: checked.size.width, height: checked.size.height });
        overlayWindow?.showInactive();
      };
      const result = hosted
        ? await generateHostedIllustration(visual.lesson, hosted, preview, controller.signal)
        : await (async () => {
          const provider = credentials!;
          const image = await generateIllustration(visual.lesson, provider.apiKey, preview, controller.signal, fetch, visual.referenceImage);
          if (!current()) throw new Error("The screen changed while the illustration was rendering.");
          // Show the completed render while part registration runs.
          preview(image);
          const registration = await locateImageParts(visual.lesson, image, provider.apiKey, provider.model, controller.signal, fetch, provider.baseUrl).catch(() => null);
          return { image, registration };
        })();
      if (!current()) throw new Error("The screen changed while the illustration was rendering.");
      const checked = decoded(result.image);
      if (!checked) throw new Error("Image provider returned an unreadable image.");
      if (!current()) throw new Error("The screen changed while the illustration was being checked.");
      const visible = result.registration && filterOpaquePositions(checked.image.toBitmap(), checked.size.width, checked.size.height, result.registration);
      const registration = visible && Object.keys(visible).length ? visible : undefined;
      overlayWindow?.webContents.send("ren:illustration", { image: result.image, preview: false, width: checked.size.width, height: checked.size.height, registration });
      overlayWindow?.showInactive();
      return true;
      } catch (error) {
        overlayWindow?.webContents.send("ren:illustration", null);
        if (imageRequestedFor === visual.lesson) imageRequestedFor = null;
        throw error;
      } finally {
        clearTimeout(timeout);
        if (imageRenderAbort === controller) imageRenderAbort = null;
      }
    } finally {
      imageRequestBusy = false;
    }
  });
  ipcMain.handle("ren:clear-annotations", (event) => {
    requireMainRenderer(event);
    imageRenderAbort?.abort();
    imageRenderAbort = null;
    captureSession.invalidate();
    lastCaptureData = null;
    lastVisualLesson = null;
    overlayWindow?.webContents.send("ren:annotations", []);
    overlayWindow?.webContents.send("ren:visual-lesson", null);
    overlayWindow?.webContents.send("ren:illustration", null);
    overlayWindow?.hide();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", stopCircleInput);

