const JOB_PREFIX = /^(?:start|run|do|create|launch)\s+(?:an?\s+)?(?:agent\s+)?(?:job|task)\s+(?:to\s+)?(.+)$/i;
const SPAWN_PREFIX = /^spawn\s+(?:an?\s+)?agent\s+(?:to\s+)?(.+)$/i;
const NATURAL_JOB = /^(?:(?:research|investigate|analyze|compare)\s+|(?:build|make|create)\s+me\s+(?:an?\s+)?(?:research\s+)?plan\s+(?:for|to|about)\s+).+/i;

export function detectAgentJobIntent(text: string): string | null {
  const command = text.trim().replace(/^hey\s+ren[,\s]*/i, "").replace(/^please\s+/i, "");
  const match = command.match(JOB_PREFIX) ?? command.match(SPAWN_PREFIX);
  const task = (match?.[1] ?? (NATURAL_JOB.test(command) ? command : "")).trim().replace(/[.!?]+$/, "").trim();
  return task && task.length >= 5 && task.length <= 2000 ? task : null;
}
