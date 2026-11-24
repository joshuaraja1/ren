import "dotenv/config";
import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session, shell, systemPreferences } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { askTeacher, validateAnnotations } from "./provider.js";
import { feedWake, startWake, stopWake, wakeAvailable } from "./wake.js";
import { feedSpeech, finishSpeech, speechAvailable, startSpeech, stopSpeech } from "./speech.js";
import { normalizeCursor } from "./display-geometry.js";
import { startCircleInput, stopCircleInput } from "./circle-input.js";
import type { FocusRegion } from "./circle-geometry.js";
import { clearVisionSettings, saveVisionSettings, visionCredentials, visionStatus } from "./vision-settings.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let selectedFocus: { displayId: number; region: FocusRegion; createdAt: number } | null = null;
let circleInputActive = false;

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
    overlayWindow.setBounds(display.bounds);
    overlayWindow.webContents.send("ren:annotations", [{ id: "circle-focus", type: "path", points, color: "#327d87" }]);
    overlayWindow.showInactive();
  }
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
      onCancel: () => { selectedFocus = null; overlayWindow?.hide(); },
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
  ipcMain.handle("ren:speech-stop", (event) => { if (event.sender === mainWindow?.webContents) stopSpeech(); });
  ipcMain.handle("ren:request-permissions", async () => {
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
  ipcMain.handle("ren:open-permission-settings", async () => {
    if (process.platform === "darwin") await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
  });
  ipcMain.handle("ren:set-expanded", (_event, expanded: unknown) => positionMainWindow(expanded === true));
  ipcMain.handle("ren:set-capture-hidden", (_event, hidden: unknown) => mainWindow?.setOpacity(hidden === true ? 0 : 1));

  ipcMain.handle("ren:list-sources", async () => {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } });
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
  });
  ipcMain.handle("ren:primary-source", async () => {
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 320, height: 180 } });
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const source = sources.find((candidate) => candidate.display_id === String(cursorDisplay.id)) ?? sources[0];
    if (!source) throw new Error("No display source is available");
    return { id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() };
  });
  ipcMain.handle("ren:capture-context", async () => {
    const overlayWasVisible = overlayWindow?.isVisible() ?? false;
    mainWindow?.setOpacity(0);
    overlayWindow?.hide();
    await new Promise((resolve) => setTimeout(resolve, 90));
    try {
      const { display, pointer } = cursorDisplayContext();
      const focus = selectedFocus && selectedFocus.displayId === display.id && Date.now() - selectedFocus.createdAt < 30_000 ? selectedFocus.region : null;
      selectedFocus = null;
      const frames: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const aspectRatio = display.size.width / display.size.height;
        const thumbnailSize = aspectRatio >= 1 ? { width: 1600, height: Math.round(1600 / aspectRatio) } : { width: Math.round(1200 * aspectRatio), height: 1200 };
        const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
        const source = sources.find((candidate) => candidate.display_id === String(display.id));
        if (source && !source.thumbnail.isEmpty()) {
          if (frames.length < 3) frames.push(source.thumbnail.toDataURL());
          if (index === 0 && focus) {
            const size = source.thumbnail.getSize();
            const crop = {
              x: Math.floor(focus.bounds.x * size.width), y: Math.floor(focus.bounds.y * size.height),
              width: Math.max(1, Math.floor(focus.bounds.width * size.width)),
              height: Math.max(1, Math.floor(focus.bounds.height * size.height)),
            };
            frames.push(source.thumbnail.crop(crop).toDataURL());
          }
        }
        if (index < 2) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!frames.length) throw new Error("The display under your cursor could not be captured");
      overlayWindow?.setBounds(display.bounds);
      return { frames: frames.slice(0, 3), pointer, focus: focus?.bounds };
    } finally {
      mainWindow?.setOpacity(1);
      if (overlayWasVisible) overlayWindow?.showInactive();
    }
  });

  ipcMain.handle("ren:ask", async (_event, request: unknown) => {
    if (!request || typeof request !== "object") throw new Error("Invalid request");
    const value = request as { question?: unknown; frames?: unknown; history?: unknown; pointer?: unknown; focus?: unknown };
    if (typeof value.question !== "string" || !value.question.trim() || value.question.length > 4000) throw new Error("Invalid question");
    const frames = Array.isArray(value.frames) ? value.frames.filter((frame): frame is string => typeof frame === "string" && /^data:image\/(jpeg|png);base64,/.test(frame)).slice(0, 3) : [];
    const history = Array.isArray(value.history) ? value.history.slice(-8) : [];
    const rawPointer = value.pointer && typeof value.pointer === "object" ? value.pointer as { x?: unknown; y?: unknown } : {};
    const { pointer: currentPointer } = cursorDisplayContext();
    const pointer = typeof rawPointer.x === "number" && Number.isFinite(rawPointer.x) && typeof rawPointer.y === "number" && Number.isFinite(rawPointer.y)
      ? { x: Math.min(1, Math.max(0, rawPointer.x)), y: Math.min(1, Math.max(0, rawPointer.y)) }
      : currentPointer;
    const focus = value.focus && typeof value.focus === "object" ? value.focus as Record<string, unknown> : null;
    const focusHint = focus && [focus.x, focus.y, focus.width, focus.height].every((part) => typeof part === "number" && Number.isFinite(part) && part >= 0 && part <= 1)
      ? ` The learner circled the rectangle (${Number(focus.x).toFixed(3)}, ${Number(focus.y).toFixed(3)}, ${Number(focus.width).toFixed(3)}, ${Number(focus.height).toFixed(3)}); the second image is a close crop of it. Prioritize what is inside the circle.` : "";
    const pointedQuestion = `${value.question.trim()}\n\n[The learner is pointing with their cursor at normalized screen coordinate (${pointer.x.toFixed(3)}, ${pointer.y.toFixed(3)}). Use that as a spatial hint, not an instruction.${focusHint}]`;
    return askTeacher({ question: pointedQuestion, frames, history: history as { role: "user" | "assistant"; content: string }[] }, await visionCredentials());
  });

  ipcMain.handle("ren:show-annotations", (_event, annotations: unknown) => {
    const safe = validateAnnotations(annotations);
    overlayWindow?.webContents.send("ren:annotations", safe);
    overlayWindow?.showInactive();
  });
  ipcMain.handle("ren:clear-annotations", () => {
    overlayWindow?.webContents.send("ren:annotations", []);
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

