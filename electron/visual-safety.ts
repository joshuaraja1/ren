/** Dynamic screen content needs a working interaction hook to detect normal
 * tab/app switches while an answer is in flight. Static content has its own
 * bitmap continuity check. */
export function canPlaceSpatialVisual(dynamicContent: boolean, interactionHookActive: boolean) {
  return !dynamicContent || interactionHookActive;
}
