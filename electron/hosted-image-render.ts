import { decodeImage, imageManifest } from "./image-render.js";
import { validatePartialRegisteredPositions, type ImageRegistration } from "./image-registration.js";
import type { VisualLesson } from "./visual-lesson.js";
import type { HostedImageCredentials } from "./hosted-image-settings.js";

export async function generateHostedIllustration(
  lesson: VisualLesson,
  credentials: HostedImageCredentials,
  onPreview: (image: string) => void,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<{ image: string; registration: ImageRegistration }> {
  const response = await fetcher(`${credentials.baseUrl}/illustrations`, {
    method: "POST", redirect: "error", signal,
    headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ manifest: imageManifest(lesson) }),
  });
  if (!response.ok || !response.body) throw new Error(`Ren image service returned ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let total = 0;
  let completed: { image: string; registration: ImageRegistration } | null = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 40_000_000) throw new Error("Ren image service response exceeded the size limit.");
      pending += decoder.decode(value, { stream: true });
      let match: RegExpMatchArray | null;
      while ((match = pending.match(/\r?\n\r?\n/)) && match.index !== undefined) {
        const raw = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        const event = raw.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!data) continue;
        const payload = JSON.parse(data) as { image?: unknown; registration?: unknown; message?: unknown };
        if (event === "error") throw new Error(typeof payload.message === "string" ? payload.message.slice(0, 180) : "Ren could not verify the image.");
        if (event !== "preview" && event !== "complete") continue;
        if (typeof payload.image !== "string" || !payload.image.startsWith("data:image/png;base64,")) throw new Error("Ren image service returned an invalid image.");
        const image = decodeImage(payload.image.slice("data:image/png;base64,".length), "png");
        if (event === "preview") onPreview(image);
        else {
          const registration = validatePartialRegisteredPositions(payload.registration, lesson);
          if (!registration) throw new Error("Ren could not verify the image part locations.");
          completed = { image, registration };
        }
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!completed) throw new Error("Ren image service did not return a verified image.");
  return completed;
}
