import { createImageService } from "./image-service.js";

if (process.env.REN_IMAGE_STAGING_ONLY !== "1") throw new Error("Set REN_IMAGE_STAGING_ONLY=1 for the guarded staging service.");
if (process.env.REN_PROVIDER_SPEND_CAP_CONFIRMED !== "1") throw new Error("Confirm a provider-level project hard spending limit before running this paid staging service.");
const digests = (process.env.REN_IMAGE_ACCESS_DIGESTS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const service = createImageService({
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  tokenDigests: digests,
  visionModel: process.env.REN_IMAGE_VISION_MODEL ?? "gpt-5.4-mini",
  dailyLimit: Number(process.env.REN_IMAGE_DAILY_LIMIT ?? "100"),
  perTokenDailyLimit: Number(process.env.REN_IMAGE_PER_TOKEN_DAILY_LIMIT ?? "10"),
  maxConcurrent: Number(process.env.REN_IMAGE_MAX_CONCURRENT ?? "2"),
});
const port = Number(process.env.PORT ?? "8080");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
service.listen(port, process.env.REN_BIND_HOST ?? "127.0.0.1", () => {
  process.stdout.write(`Ren image service listening on port ${port}\n`);
});
