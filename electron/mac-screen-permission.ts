/** Ask macOS for Screen Recording access from Ren's signed main process. */
export async function requestMacScreenCaptureAccess(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  const { default: koffi } = await import("koffi");
  const coreGraphics = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
  const request = coreGraphics.func("bool CGRequestScreenCaptureAccess(void)");
  return request() === true;
}
