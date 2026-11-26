import type { VisualLesson } from "./visual-lesson.js";
import type { ScenePrimitive, SceneSpec } from "./scene-spec.js";

type Position = [number, number, number];

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
