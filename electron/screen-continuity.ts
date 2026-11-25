/** Compare pixels that stayed still across the initial capture burst. Moving video
 * pixels are excluded, while browser chrome and surrounding UI anchor the view. */
export function isSameStableScreen(first: Uint8Array, second: Uint8Array, fresh: Uint8Array): boolean {
  if (first.length !== second.length || first.length !== fresh.length || first.length < 16 || first.length % 4 !== 0) return false;
  let stable = 0;
  let changed = 0;
  const pixels = first.length / 4;
  for (let offset = 0; offset < first.length; offset += 4) {
    const initialDifference = Math.abs(first[offset] - second[offset]) + Math.abs(first[offset + 1] - second[offset + 1]) + Math.abs(first[offset + 2] - second[offset + 2]);
    if (initialDifference >= 54) continue;
    stable += 1;
    const laterDifference = Math.abs(first[offset] - fresh[offset]) + Math.abs(first[offset + 1] - fresh[offset + 1]) + Math.abs(first[offset + 2] - fresh[offset + 2]);
    if (laterDifference >= 54) changed += 1;
  }
  // With too few stationary pixels, there is no trustworthy spatial anchor.
  return stable / pixels >= 0.15 && changed / stable < 0.1;
}
