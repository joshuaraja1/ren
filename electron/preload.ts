import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ren", {
  platform: process.platform,
  version: "0.1.0",
});

