import type { VisualLesson } from "../electron/visual-lesson";
import type { ImageRegistration } from "../electron/image-registration";

export type Point = { x: number; y: number };

export type Annotation =
  | { id: string; type: "arrow"; from: Point; to: Point; label?: string; color?: string }
  | { id: string; type: "rectangle"; at: Point; width: number; height: number; label?: string; color?: string }
  | { id: string; type: "point"; at: Point; label?: string; color?: string }
  | { id: string; type: "text"; at: Point; text: string; color?: string }
  | { id: string; type: "path"; points: Point[]; label?: string; color?: string }
  | { id: string; type: "diagram"; at: Point; title: string; lines: string[]; color?: string };

export type ScreenSource = {
  id: string;
  name: string;
  thumbnail: string;
};

export type ConversationTurn = { role: "user" | "assistant"; content: string };

export type AskRequest = {
  question: string;
  frames: string[];
  history: ConversationTurn[];
  pointer?: Point;
  contextToken?: string;
};

export type FocusBounds = { x: number; y: number; width: number; height: number };
export type ScreenContext = { frames: string[]; pointer: Point; focus?: FocusBounds; contextToken?: string };

export type AmbientStatus = {
  ready: boolean;
  microphone: string;
  screen: string;
  interaction?: string;
};

export type AskResponse = {
  answer: string;
  annotations: Annotation[];
  followUps?: string[];
  provider: "demo" | "vision";
  visualLesson?: VisualLesson;
  autoIllustrate?: boolean;
};
export type Illustration = { image: string; preview: boolean; width: number; height: number; registration?: ImageRegistration };

export type VisionStatus = { mode: "connected" | "environment" | "local" | "available" | "demo"; model: string; host: string; baseUrl: string };
export type VisionSettingsInput = { apiKey: string; model: string; baseUrl: string };
export type HostedImageStatus = { mode: "connected" | "environment" | "demo"; baseUrl: string; host: string };
export type HostedImageSettingsInput = { baseUrl: string; accessToken: string };
export type DeepgramStatus = { mode: "connected" | "environment" | "demo" };

export type RenBridge = {
  platform: string;
  version: string;
  listSources(): Promise<ScreenSource[]>;
  primarySource(): Promise<ScreenSource>;
  permissionStatus(): Promise<AmbientStatus>;
  visionStatus(): Promise<VisionStatus>;
  saveVisionSettings(value: VisionSettingsInput): Promise<VisionStatus>;
  clearVisionSettings(): Promise<VisionStatus>;
  hostedImageStatus(): Promise<HostedImageStatus>;
  saveHostedImageSettings(value: HostedImageSettingsInput): Promise<HostedImageStatus>;
  clearHostedImageSettings(): Promise<HostedImageStatus>;
  enableCircleInput(): Promise<AmbientStatus>;
  requestPermissions(): Promise<AmbientStatus>;
  openPermissionSettings(kind?: "screen" | "microphone"): Promise<void>;
  setExpanded(expanded: boolean): Promise<void>;
  captureContext(): Promise<ScreenContext>;
  wakeAvailable(): Promise<boolean>;
  wakeStart(sampleRate: number): Promise<boolean>;
  wakeFeed(samples: number[]): Promise<boolean>;
  wakeStop(): Promise<void>;
  speechAvailable(): Promise<boolean>;
  speechStart(sampleRate: number): Promise<boolean>;
  speechFeed(samples: number[]): Promise<boolean>;
  speechFinish(): Promise<string>;
  speechStop(): Promise<void>;
  deepgramStatus(): Promise<DeepgramStatus>;
  saveDeepgramKey(key: string): Promise<DeepgramStatus>;
  clearDeepgramKey(): Promise<DeepgramStatus>;
  speak(id: string, text: string): Promise<boolean>;
  onSpeechData(listener: (data: { id: string; chunk?: string; done?: boolean; error?: string }) => void): () => void;
  ask(request: AskRequest): Promise<AskResponse>;
  clearAnnotations(): Promise<void>;
  generateIllustration(automatic?: boolean): Promise<boolean>;
  onIllustration(listener: (image: Illustration | null) => void): () => void;
  onAnnotations(listener: (annotations: Annotation[]) => void): () => void;
  onVisualLesson(listener: (lesson: VisualLesson | null) => void): () => void;
  onFocusSelection(listener: () => void): () => void;
};
