/** A local wake candidate must be present in the first transcript before Ren answers. */
export function confirmedWakeQuestion(transcript: string): string | null {
  const match = transcript.match(/\bhey[\s,.-]+ren\b/i);
  if (!match) return null;
  return transcript.slice((match.index ?? 0) + match[0].length).replace(/^[,.:;\s-]+/, "").trim();
}
