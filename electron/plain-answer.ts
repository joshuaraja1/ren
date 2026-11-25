/** Turn model formatting into readable text before display and speech. */
export function plainAnswer(value: string): string {
  return value
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(?:\*\*|__)([\s\S]*?)(?:\*\*|__)/g, "$1")
    .replace(/(?:\*|_)([^\s*_][^*_]*?)(?:\*|_)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
