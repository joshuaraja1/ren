import "dotenv/config";
import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { askTeacher, validateAnnotations } from "./provider.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

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
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) void overlayWindow.loadURL(`${developmentUrl}/overlay.html`);
  else void overlayWindow.loadFile(join(currentDirectory, "../dist/overlay.html"));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f2efe8",
    show: false,
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
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
  createMainWindow();
  createOverlayWindow();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media" && webContents === mainWindow?.webContents);
  });

  ipcMain.handle("ren:list-sources", async () => {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } });
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
  });

  ipcMain.handle("ren:ask", async (_event, request: unknown) => {
    if (!request || typeof request !== "object") throw new Error("Invalid request");
    const value = request as { question?: unknown; frames?: unknown; history?: unknown };
    if (typeof value.question !== "string" || !value.question.trim() || value.question.length > 4000) throw new Error("Invalid question");
    const frames = Array.isArray(value.frames) ? value.frames.filter((frame): frame is string => typeof frame === "string" && /^data:image\/(jpeg|png);base64,/.test(frame)).slice(0, 3) : [];
    const history = Array.isArray(value.history) ? value.history.slice(-8) : [];
    return askTeacher({ question: value.question.trim(), frames, history: history as { role: "user" | "assistant"; content: string }[] });
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

