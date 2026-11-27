/** A local wake candidate must be present in the first transcript before Ren answers. */
export function confirmedWakeQuestion(transcript: string): string | null {
  // Speech recognition commonly spells the name as "run", "ran", "Ryan", or "wren".
  const match = transcript.match(/\bhey[\s,.-]+(?:ren|run|ran|ryan|wren)\b/i);
  if (!match) return null;
  return transcript.slice((match.index ?? 0) + match[0].length).replace(/^[,.:;!?\s-]+/, "").trim();
}
