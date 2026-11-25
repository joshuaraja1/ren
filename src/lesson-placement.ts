export function placeLessonCard(anchorX: number, anchorY: number, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const right = anchorX > viewportWidth - width - 20;
  const preferredX = right ? anchorX - width - 12 : anchorX + 12;
  const preferredY = anchorY - height / 2;
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
  return {
    x: clamp(preferredX, 8, viewportWidth - width - 8) - anchorX,
    y: clamp(preferredY, 8, viewportHeight - height - 8) - anchorY,
    right,
  };
}
