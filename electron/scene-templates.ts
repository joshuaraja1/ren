import type { VisualLesson } from "./visual-lesson.js";
import type { ScenePrimitive, SceneSpec } from "./scene-spec.js";

type Position = [number, number, number];

/** Pi 5 and Camera Module 3 using the official 22-pin-to-15-pin Standard-Mini cable. */
export function raspberryPiCameraTemplate(lesson: VisualLesson, question: string, assemblyRequested: boolean): SceneSpec | null {
  const context = `${lesson.title} ${lesson.assumption ?? ""} ${question}`;
  if (!/\braspberry\s*pi\s*5\b/i.test(context) || !/\bcamera\b/i.test(context) || /\braspberry\s*pi\s*(?:zero|[1-4])\b/i.test(context)
    || lesson.parts.length !== 3) return null;
  const board = lesson.parts.filter((part) => /\b(?:raspberry\s*pi|pi\s*5|main\s*board|host\s*board)\b/i.test(part.label));
  const cable = lesson.parts.filter((part) => /\b(?:ribbon|flex(?:ible)?\s*cable|cable)\b/i.test(part.label));
  const camera = lesson.parts.filter((part) => /\bcamera\b/i.test(part.label) && !/\bcable\b/i.test(part.label));
  if (board.length !== 1 || cable.length !== 1 || camera.length !== 1 || new Set([board[0].id, cable[0].id, camera[0].id]).size !== 3) return null;
  const [piId, cableId, cameraId] = [board[0].id, cable[0].id, camera[0].id];
  const primitives: ScenePrimitive[] = [];
  // Author the layout as a readable top view, then place it on the XZ table plane.
  // The former XY layout made the board appear upright and hid its thickness.
  const onTable = ([x, y, depth]: Position): Position => [x, depth, -y];
  const tableScale = ([width, length, thickness]: Position): Position => [width, thickness, length];
  const box = (partId: string, position: Position, scale: Position, color: string) =>
    primitives.push({ partId, kind: "box", position: onTable(position), scale: tableScale(scale), rotation: [0, 0, 0], color });
  const cylinder = (partId: string, position: Position, scale: Position, color: string) =>
    primitives.push({ partId, kind: "cylinder", position: onTable(position), scale, rotation: [0, 0, 0], color });

  // The open top shows the two CAM/DISP sockets at the board edge; no invented pin detail.
  box(piId, [0, .35, 0], [3.7, 2.45, .12], "#287b49");
  for (const x of [-1.55, 1.55]) for (const y of [-.58, 1.3]) cylinder(piId, [x, y, .09], [.16, .04, .16], "#d0ad69");
  box(piId, [-.55, .7, .11], [.87, .74, .13], "#59646d");
  box(piId, [-1.18, -.38, .11], [.63, .42, .15], "#a0a8a9");
  box(piId, [1.13, .75, .12], [.35, 1.2, .18], "#343a3e");
  box(piId, [.62, -.67, .14], [.37, .19, .2], "#d7dfd7");
  box(piId, [1.03, -.67, .14], [.37, .19, .2], "#d7dfd7");
  box(piId, [.62, -.7, .26], [.33, .05, .035], "#33393d");
  box(piId, [1.03, -.7, .26], [.33, .05, .035], "#33393d");
  // Back-edge GPIO header and side ports make the Pi 5 silhouette legible from
  // the same three-quarter view as the source image.
  box(piId, [-.16, 1.4, .12], [2.4, .19, .18], "#202a30");
  for (let index = 0; index < 8; index++) {
    cylinder(piId, [-1.17 + index * .29, 1.4, .28], [.045, .28, .045], "#d8ad65");
  }
  box(piId, [1.62, 1.02, .27], [.55, .5, .4], "#9aa7ad");
  box(piId, [1.62, .45, .27], [.55, .5, .4], "#919fa5");
  box(piId, [1.6, -.24, .32], [.61, .65, .48], "#aab4b6");
  box(piId, [1.91, 1.02, .27], [.03, .35, .23], "#2b6885");
  box(piId, [1.91, .45, .27], [.03, .35, .23], "#2b6885");
  box(piId, [1.92, -.24, .32], [.03, .49, .3], "#35464d");
  box(piId, [-.42, -.32, .12], [.38, .28, .11], "#283940");
  box(piId, [.02, .14, .12], [.29, .25, .11], "#34464c");
  box(piId, [-1.15, .65, .19], [.23, .18, .15], "#c3c8bb");

  // The reference has the module standing above the horizontal board, with a
  // continuous ribbon from its lower connector down into CAM/DISP0.
  primitives.push({ partId: cableId, kind: "box", position: [.62, 1.18, .7], scale: [.28, 2.13, .035], rotation: [0, 0, 0], color: "#c5d0ca" });
  primitives.push({ partId: cableId, kind: "box", position: [.62, .14, .72], scale: [.24, .12, .025], rotation: [0, 0, 0], color: "#cba55e" });
  primitives.push({ partId: cableId, kind: "box", position: [.62, 2.24, .72], scale: [.24, .12, .025], rotation: [0, 0, 0], color: "#cba55e" });
  primitives.push({ partId: cableId, kind: "box", position: [.62, .25, .73], scale: [.28, .1, .025], rotation: [0, 0, 0], color: "#2676a5" });
  primitives.push({ partId: cableId, kind: "box", position: [.62, 2.13, .73], scale: [.28, .1, .025], rotation: [0, 0, 0], color: "#2676a5" });

  primitives.push({ partId: cameraId, kind: "box", position: [.62, 2.56, .7], scale: [.72, .74, .09], rotation: [0, 0, 0], color: "#277e4b" });
  primitives.push({ partId: cameraId, kind: "box", position: [.62, 2.23, .77], scale: [.28, .13, .12], rotation: [0, 0, 0], color: "#d5ddd5" });
  primitives.push({ partId: cameraId, kind: "box", position: [.62, 2.58, .84], scale: [.42, .4, .22], rotation: [0, 0, 0], color: "#34383c" });
  primitives.push({ partId: cameraId, kind: "cylinder", position: [.62, 2.58, 1.01], scale: [.24, .28, .24], rotation: [Math.PI / 2, 0, 0], color: "#1c2429" });
  primitives.push({ partId: cameraId, kind: "torus", position: [.62, 2.58, 1.18], scale: [.4, .4, .15], rotation: [0, 0, 0], color: "#54616b" });

  return {
    version: 1, subject: "Raspberry Pi 5 with Camera Module (Standard-Mini cable)", fidelity: "conceptual", primitives,
    anchors: [
      { partId: piId, position: onTable([.9, .68, .16]) },
      { partId: cableId, position: [.62, 1.18, .75] },
      { partId: cameraId, position: [.62, 2.58, 1.2] },
    ],
    ...(assemblyRequested ? { assembly: [
      { partId: cableId, from: [.85, .45, .75], instruction: "Power off Pi 5. Gently lift the CAM/DISP0 latch. Insert the 22-pin Standard-Mini end straight with contacts away from the latch; close the latch." },
      { partId: cameraId, from: [.85, .45, .75], instruction: "Gently lift the camera connector latch. Insert the 15-pin end straight with contacts toward the camera board; close the latch. Test with rpicam-hello." },
    ] } : {}),
  };
}

/** A recognizable open desktop tower, used when the requested parts match this layout. */
export function desktopComputerTemplate(lesson: VisualLesson, question: string, assemblyRequested: boolean): SceneSpec | null {
  if (!/\b(?:desktop|tower|pc case)\b/i.test(`${lesson.title} ${question}`) || lesson.parts.length < 5 || lesson.parts.length > 6) return null;
  const roles = [
    ["case", /\b(?:case|chassis|tower)\b/i],
    ["motherboard", /\b(?:motherboard|mainboard)\b/i],
    ["cpu", /\b(?:cpu|processor)\b/i],
    ["ram", /\b(?:ram|memory)\b/i],
    ["power", /\b(?:power supply|psu)\b/i],
  ] as const;
  const ids: Record<(typeof roles)[number][0], string> = {} as Record<(typeof roles)[number][0], string>;
  for (const [role, pattern] of roles) {
    const matches = lesson.parts.filter((part) => pattern.test(part.label));
    if (matches.length !== 1) return null;
    ids[role] = matches[0].id;
  }
  if (new Set(Object.values(ids)).size !== 5) return null;
  const extras = lesson.parts.filter((part) => !Object.values(ids).includes(part.id));
  if (extras.length > 1 || (extras.length === 1 && !/\b(?:power\s+)?cables?\b/i.test(extras[0].label))) return null;
  const cableId = extras[0]?.id;
  const primitives: ScenePrimitive[] = [];
  const box = (partId: string, position: Position, scale: Position, color: string, opacity?: number) =>
    primitives.push({ partId, kind: "box", position, scale, rotation: [0, 0, 0], color, ...(opacity === undefined ? {} : { opacity }) });
  const ring = (partId: string, position: Position, scale: Position, color: string) =>
    primitives.push({ partId, kind: "torus", position, scale, rotation: [0, 0, 0], color });

  // Leave the front open. A solid translucent box hides the very parts the learner needs to see.
  box(ids.case, [0, 0, -.91], [4.3, 4.7, .12], "#53616e");
  box(ids.case, [-2.12, 0, -.08], [.12, 4.7, 1.7], "#687886");
  box(ids.case, [2.12, 0, -.08], [.12, 4.7, 1.7], "#687886");
  box(ids.case, [0, 2.29, -.08], [4.3, .12, 1.7], "#687886");
  box(ids.case, [0, -2.29, -.08], [4.3, .12, 1.7], "#687886");
  box(ids.case, [0, 0, -.87], [3.92, 4.32, .025], "#34414d");

  box(ids.motherboard, [-.08, .3, -.66], [3.25, 3.68, .08], "#27776c");
  box(ids.motherboard, [-.72, .62, -.57], [.94, .94, .04], "#263b42");
  box(ids.motherboard, [.65, .55, -.56], [.22, 1.7, .04], "#1b3538");
  box(ids.motherboard, [1.03, .55, -.56], [.22, 1.7, .04], "#1b3538");
  box(ids.motherboard, [-.2, -1.04, -.56], [2.18, .17, .05], "#243d47");
  box(ids.motherboard, [-.2, -1.38, -.56], [2.18, .17, .05], "#243d47");
  box(ids.motherboard, [-1.27, 1.51, -.55], [.53, .23, .08], "#354c58");
  box(ids.motherboard, [1.22, -1.35, -.54], [.42, .38, .09], "#344d56");

  box(ids.cpu, [-.72, .62, -.47], [.78, .78, .13], "#c1cbd0");
  box(ids.cpu, [-.72, .62, -.395], [.61, .61, .02], "#e0e5e3");

  for (const x of [.65, 1.03]) {
    box(ids.ram, [x, .55, -.42], [.15, 1.49, .17], "#2c9a75");
    for (const y of [.12, .48, .84]) box(ids.ram, [x, y, -.315], [.11, .22, .035], "#263d43");
  }

  box(ids.power, [-1.16, -1.74, .05], [1.55, .82, 1.2], "#626e77");
  box(ids.power, [-1.16, -1.74, .67], [1.41, .69, .04], "#3a454e");
  ring(ids.power, [-1.16, -1.74, .71], [.57, .57, .57], "#a6b5bb");
  box(ids.power, [-.61, -1.74, .70], [.18, .14, .05], "#cfb76c");
  if (cableId) {
    box(cableId, [.2, -1.72, .75], [1.68, .08, .08], "#202d33");
    box(cableId, [1.02, -1.45, .75], [.08, .58, .08], "#202d33");
    box(cableId, [1.02, -1.17, .18], [.08, .08, 1.16], "#202d33");
  }

  const assembly: SceneSpec["assembly"] = [
    { partId: ids.motherboard, from: [0, .1, 1.75], instruction: "Place the motherboard against the case standoffs." },
    { partId: ids.cpu, from: [0, .55, 1.7], instruction: "Align the CPU with its motherboard socket." },
    { partId: ids.ram, from: [0, 1.35, .5], instruction: "Align the RAM sticks with the memory slots." },
    { partId: ids.power, from: [-.1, -.25, 1.4], instruction: "Place the power supply in the lower case bay." },
    ...(cableId ? [{ partId: cableId, from: [0, 0, 1.25] as Position, instruction: "Route the power cable toward the motherboard power socket." }] : []),
  ];
  return {
    version: 1, subject: "Open desktop computer tower", fidelity: "conceptual", primitives,
    anchors: [
      { partId: ids.case, position: [1.96, 1.76, .3] },
      { partId: ids.motherboard, position: [-.1, 1.55, -.58] },
      { partId: ids.cpu, position: [-.72, .62, -.37] },
      { partId: ids.ram, position: [1.03, .55, -.27] },
      { partId: ids.power, position: [-1.16, -1.74, .72] },
      ...(cableId ? [{ partId: cableId, position: [.2, -1.72, .78] as Position }] : []),
    ],
    ...(assemblyRequested ? { assembly } : {}),
  };
}
