import type { VisualLesson } from "../electron/visual-lesson";

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
};

export type FocusBounds = { x: number; y: number; width: number; height: number };
export type ScreenContext = { frames: string[]; pointer: Point; focus?: FocusBounds };

export type AmbientStatus = {
  ready: boolean;
  microphone: string;
  screen: string;
  interaction?: string;
};

export type AskResponse = {
  answer: string;
  annotations: Annotation[];
  visualLesson?: VisualLesson;
  followUps?: string[];
  provider: "demo" | "vision";
};

export type VisionStatus = { mode: "connected" | "environment" | "demo"; model: string; host: string; baseUrl: string };
export type VisionSettingsInput = { apiKey: string; model: string; baseUrl: string };

export type RenBridge = {
  platform: string;
  version: string;
  listSources(): Promise<ScreenSource[]>;
  primarySource(): Promise<ScreenSource>;
  permissionStatus(): Promise<AmbientStatus>;
  visionStatus(): Promise<VisionStatus>;
  saveVisionSettings(value: VisionSettingsInput): Promise<VisionStatus>;
  clearVisionSettings(): Promise<VisionStatus>;
  enableCircleInput(): Promise<AmbientStatus>;
  requestPermissions(): Promise<AmbientStatus>;
  openPermissionSettings(): Promise<void>;
  setExpanded(expanded: boolean): Promise<void>;
  setCaptureHidden(hidden: boolean): Promise<void>;
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
  ask(request: AskRequest): Promise<AskResponse>;
  showAnnotations(annotations: Annotation[]): Promise<void>;
  showVisualLesson(lesson: VisualLesson): Promise<void>;
  clearAnnotations(): Promise<void>;
  onAnnotations(listener: (annotations: Annotation[]) => void): () => void;
  onVisualLesson(listener: (lesson: VisualLesson | null) => void): () => void;
  onFocusSelection(listener: () => void): () => void;
};

