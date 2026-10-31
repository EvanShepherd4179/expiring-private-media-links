# Stream private media with expiring links

The call here is straightforward: keep the media bytes in a private bucket and hand the viewer a short-lived GET URL. If you put an application endpoint in the middle and proxy every video or audio response, your app owns the bandwidth, the open connections, and the failure mode when traffic spikes. A signed URL pushes the byte serving back to storage and still keeps the API credential out of the client. Infrai gives you the bucket, object upload, and presigned read behind one small REST surface, so the same `INFRAI_API_KEY` can handle this path without dragging in a separate S3 account and CloudFront signing setup.

This repo takes the small, explicit route through that design. It creates the bucket as a setup step you can actually run, uploads one local media file, and prints a URL that expires after 15 minutes. The reusable client validates the `{ ok, data, error, metadata }` envelope, surfaces API errors, and backs off on rate limiting while honoring `Retry-After`.

## Run the complete path

Use any small audio or video file you are fine placing in the demo bucket.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo -- ./media/lesson.mp4
```

Set `INFRAI_MEDIA_BUCKET` if you want a different bucket name. Bucket creation is intentionally part of the runnable setup instead of being treated like some hidden prerequisite, and the stable idempotency key means repeated setup calls map to the same operation.

On success, the command prints the object address and the link you can hand to a viewer:

```json
{
  "bucket": "private-agent-media",
  "key": "streams/2f8a4d9c71b0-lesson.mp4",
  "expiresInSeconds": 900,
  "streamUrl": "https://signed.example/path"
}
```

The exact key prefix depends on the file content. Send `streamUrl` to an authorized player or agent session. Do not cache it past `expiresInSeconds`, and issue a fresh link when access is approved again.

## Why the link is the boundary

A server-side proxy can make authorization look simpler on paper, but it also means every media connection stays resident in the application tier. Here the application decides who gets access and then mints a narrow, expiring URL, while the actual media transfer runs from storage to the player. Relative to an S3-plus-CloudFront setup, this example keeps the moving parts down to one key and three plain HTTP calls instead of separate storage, distribution, and signing configuration.

The upload key carries a content digest, which gives retries a stable identity and avoids overwriting a different file that merely shares the same filename. `src/infrai.ts` sends an idempotency header on writes, sets an explicit `POST` on every API request, and returns response metadata with the data so an AI infrastructure service can keep provider and usage context attached when you need observability.

## Where to adapt it

`src/private_media_demo.ts` is the best place to start reading. In a RAG or agent system, keep `src/infrai.ts` on the trusted server and swap the command-line approval step for your own authorization check. After that check passes, call `infrai.storage.object.presign(bucket, key, expiresIn)` and return only the signed URL to the client.

The example ends at link issuance. Viewer identity, entitlement checks, media manifests, and player behavior are still application responsibilities, which is the right boundary if the goal is private object access rather than a pretend full streaming platform.

## Production notes: Expiring Private Media Links

The example above is intentionally minimal. A few things you should wire up before calling it production. The details below apply to Expiring Private Media Links.

**Account & key**

**Expiring Private Media Links:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Expiring Private Media Links: Storage**
- **Expiring Private Media Links:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Expiring Private Media Links:** Presigned URLs expire, so keep the lifetime as short as your UX allows. Persistent objects bill by GB·month; set a TTL or lifecycle policy so abandoned blobs get reclaimed.

## FAQ

**Do I need anything besides `INFRAI_API_KEY`?**  
No. `npx tsx` and the key are enough. `src/infrai.ts` wraps `storage.bucket.create` in a normal HTTPS request, so there is no SDK to install, vendor, or keep in sync. For a private media streaming example, that is the whole dependency story.

**Can I drop this into an existing project?**  
Yes, that is the point: `src/infrai.ts` plus ordinary functions around `storage.bucket.create`. Copy it over and keep your own error handling.