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
};

export type AskResponse = {
  answer: string;
  annotations: Annotation[];
  provider: "demo" | "vision";
};

export type RenBridge = {
  platform: string;
  version: string;
  listSources(): Promise<ScreenSource[]>;
  ask(request: AskRequest): Promise<AskResponse>;
  showAnnotations(annotations: Annotation[]): Promise<void>;
  clearAnnotations(): Promise<void>;
  onAnnotations(listener: (annotations: Annotation[]) => void): () => void;
};

