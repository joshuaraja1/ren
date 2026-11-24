/// <reference types="vite/client" />

import type { RenBridge } from "./contracts";

declare global {
  interface Window {
    ren?: RenBridge;
  }
}

export {};

