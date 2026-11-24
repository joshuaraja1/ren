/** Detect motion in equally sized four-byte bitmap thumbnails without retaining full frames. */
export function hasMeaningfulMotion(first: Uint8Array, next: Uint8Array): boolean {
  if (first.length !== next.length || first.length < 16 || first.length % 4 !== 0) return false;
  let changed = 0;
  let observed = 0;
  for (let offset = 0; offset < first.length; offset += 16) {
    const difference = Math.abs(first[offset] - next[offset])
      + Math.abs(first[offset + 1] - next[offset + 1])
      + Math.abs(first[offset + 2] - next[offset + 2])
      + Math.abs(first[offset + 3] - next[offset + 3]);
    if (difference >= 54) changed += 1;
    observed += 1;
  }
  return changed / observed >= 0.03;
}
