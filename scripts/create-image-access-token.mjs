import { randomBytes, createHash } from "node:crypto";

const token = randomBytes(32).toString("base64url");
const digest = createHash("sha256").update(token).digest("hex");
process.stdout.write(`Ren access token (give privately to one tester): ${token}\n`);
process.stdout.write(`SHA-256 digest (put in REN_IMAGE_ACCESS_DIGESTS): ${digest}\n`);
