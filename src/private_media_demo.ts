import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { infrai } from "./infrai.ts";

const mediaPath = process.argv[2];
if (!mediaPath) {
  throw new Error("Pass a media file path: npm run demo -- ./media/lesson.mp4");
}

const bucket = process.env.INFRAI_MEDIA_BUCKET ?? "private-agent-media";
const media = await readFile(mediaPath);
const digest = createHash("sha256").update(media).digest("hex");
const key = `streams/${digest.slice(0, 12)}-${basename(mediaPath)}`;

// Provisioning belongs in the runnable path so a fresh account starts from a known state.
await infrai.storage.bucket.create(bucket);

await infrai.storage.object.put(
  bucket,
  key,
  media.toString("base64"),
  `put-media:${bucket}:${key}:${digest}`,
);

const { data: signed } = await infrai.storage.object.presign(bucket, key, 900);

console.log(
  JSON.stringify(
    {
      bucket,
      key,
      expiresInSeconds: 900,
      streamUrl: signed.url,
    },
    null,
    2,
  ),
);
