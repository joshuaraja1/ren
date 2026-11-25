import "dotenv/config";
import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session, shell, systemPreferences } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { askTeacher } from "./provider.js";
import { feedWake, startWake, stopWake, wakeAvailable } from "./wake.js";
import { feedSpeech, finishSpeech, speechAvailable, startSpeech, stopSpeech } from "./speech.js";
import { normalizeCursor } from "./display-geometry.js";
import { startCircleInput, stopCircleInput } from "./circle-input.js";
import type { FocusRegion } from "./circle-geometry.js";
import { clearVisionSettings, saveVisionSettings, visionCredentials, visionStatus } from "./vision-settings.js";
import { parseAskRequest } from "./request-validation.js";
import { hasMeaningfulMotion } from "./frame-motion.js";
import { isSameStableScreen } from "./screen-continuity.js";
import { canPlaceSpatialVisual } from "./visual-safety.js";
import { generateIllustration } from "./image-render.js";
import { validateVisualLesson } from "./visual-lesson.js";
import { CaptureSession } from "./capture-session.js";
import type { VisualLesson } from "./visual-lesson.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let selectedFocus: { displayId: number; region: FocusRegion; createdAt: number } | null = null;
let circleInputActive = false;
const captureSession = new CaptureSession();
let lastCaptureData: { token: string; frames: string[]; pointer: { x: number; y: number }; focus?: { x: number; y: number; width: number; height: number }; firstSample: Uint8Array; secondSample: Uint8Array; dynamicContent: boolean; thumbnailSize: { width: number; height: number } } | null = null;
let lastVisualLesson: { lesson: VisualLesson; displayId: number; createdAt: number } | null = null;
let screenCaptureBusy = false;
let pendingAnswerToken: string | null = null;
let activeCaptureToken: string | null = null;
let imageRenderAbort: AbortController | null = null;

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
  return { ready: hasCompletedOnboarding() && microphone === "granted" && screenAccess === "granted", microphone, screen: screenAccess, interaction: circleInputActive ? "granted" : accessibility ? "unavailable" : "not-granted" };
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

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.once("ready-to-show", () => {
    const needsOnboarding = !permissionStatus().ready;
    positionMainWindow(needsOnboarding);
    mainWindow?.showInactive();
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
        positionMainWindow(true, displayId);
        mainWindow?.showInactive();
        mainWindow?.webContents.send("ren:focus-selection");
      },
      onCancel: invalidateSpatialContext,
      onScroll: invalidateSpatialContext,
      onInteraction: () => {
        // Switching tabs or apps normally requires a click or key. Cancel any
        // answer that was grounded before that interaction, including video.
        const token = pendingAnswerToken ?? activeCaptureToken;
        if (token && captureSession.isCurrent(token)) captureSession.invalidate();
        imageRenderAbort?.abort();
      },
    });
    return circleInputActive;
  }
  if (permissionStatus().ready) enableCircleInput();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media" && webContents === mainWindow?.webContents);
  });

  ipcMain.handle("ren:permission-status", permissionStatus);
  ipcMain.handle("ren:vision-status", (event) => event.sender === mainWindow?.webContents ? visionStatus() : null);
  ipcMain.handle("ren:vision-save", (event, value: unknown) => {
    if (event.sender !== mainWindow?.webContents) throw new Error("Not allowed");
    return saveVisionSettings(value);
  });
  ipcMain.handle("ren:vision-clear", (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error("Not allowed");
    return clearVisionSettings();
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
  ipcMain.handle("ren:request-permissions", async (event) => {
    requireMainRenderer(event);
    if (process.platform === "darwin") await systemPreferences.askForMediaAccess("microphone");
    if (process.platform === "darwin") systemPreferences.isTrustedAccessibilityClient(true);
    await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
    const access = permissionStatus();
    const canComplete = process.platform !== "darwin" || (access.microphone === "granted" && access.screen === "granted");
    if (canComplete) writeFileSync(onboardingMarkerPath(), new Date().toISOString(), { encoding: "utf8", mode: 0o600 });
    if (permissionStatus().ready) {
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
      enableCircleInput();
    }
    return permissionStatus();
  });
  ipcMain.handle("ren:open-permission-settings", async (event) => {
    requireMainRenderer(event);
    if (process.platform === "darwin") await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
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
    const response = await askTeacher({ question: pointedQuestion, frames: capture.frames, history: value.history, priorVisualLesson }, await visionCredentials());
    const display = screen.getAllDisplays().find((item) => item.id === displayId);
    if (!captureSession.isCurrent(value.contextToken) || !display || screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id !== displayId) {
      throw new Error("The screen changed while Ren was answering. Ask again.");
    }
    const spatialAllowed = canPlaceSpatialVisual(capture.dynamicContent, circleInputActive);
    const lesson = spatialAllowed ? validateVisualLesson(response.visualLesson) : null;
    const annotations = spatialAllowed ? response.annotations : [];
    if (annotations.length || lesson) {
      if (screenCaptureBusy) throw new Error("Ren is already capturing the screen. Ask again.");
      screenCaptureBusy = true;
      mainWindow?.setOpacity(0);
      overlayWindow?.hide();
      try {
        await new Promise((resolve) => setTimeout(resolve, 60));
        const fresh = await captureDisplay(displayId, capture.thumbnailSize);
        if (!fresh || !isSameStableScreen(capture.firstSample, capture.secondSample, motionSample(fresh))) {
          throw new Error("The screen changed while Ren was answering. Ask again.");
        }
      } finally { mainWindow?.setOpacity(1); screenCaptureBusy = false; }
      if (!captureSession.isCurrent(value.contextToken) || screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id !== displayId) {
        throw new Error("The screen changed while Ren was answering. Ask again.");
      }
    }
    overlayWindow?.setBounds(display.bounds);
    overlayWindow?.webContents.send("ren:annotations", annotations);
    overlayWindow?.webContents.send("ren:visual-lesson", lesson);
    overlayWindow?.webContents.send("ren:illustration", null);
    if (annotations.length || lesson) overlayWindow?.showInactive();
    else overlayWindow?.hide();
    lastVisualLesson = lesson ? { lesson, displayId, createdAt: Date.now() } : null;
    return { ...response, annotations, visualLesson: lesson ?? undefined };
    } finally {
      if (pendingAnswerToken === value.contextToken) pendingAnswerToken = null;
    }
  });
  ipcMain.handle("ren:generate-illustration", async (event) => {
    requireMainRenderer(event);
    if (imageRenderAbort) throw new Error("An illustration is already rendering.");
    const visual = lastVisualLesson;
    if (!visual || !circleInputActive) throw new Error("A current visual lesson and pointer permission are required.");
    const credentials = await visionCredentials();
    if (!credentials || new URL(credentials.baseUrl).origin !== "https://api.openai.com") throw new Error("Illustrations currently require an OpenAI provider.");
    const controller = new AbortController();
    imageRenderAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 90_000);
    const current = () => lastVisualLesson === visual && screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id === visual.displayId && !controller.signal.aborted;
    try {
      const image = await generateIllustration(visual.lesson, credentials.apiKey, (preview) => {
        if (!current()) { controller.abort(); return; }
        overlayWindow?.webContents.send("ren:illustration", { image: preview, preview: true });
      }, controller.signal);
      if (!current()) throw new Error("The screen changed while the illustration was rendering.");
      overlayWindow?.webContents.send("ren:illustration", { image, preview: false });
      return true;
    } catch (error) {
      overlayWindow?.webContents.send("ren:illustration", null);
      throw error;
    } finally {
      clearTimeout(timeout);
      if (imageRenderAbort === controller) imageRenderAbort = null;
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

