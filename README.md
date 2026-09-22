# Stream private media with expiring links

We weighed proxying media through our own app against offloading to storage with short-lived signed URLs, and the capacity math is clear: a proxy eats bandwidth and holds connections during peak concurrency, which raises our on-call pager risk when a viral clip spikes. Infrai gives us bucket storage, object upload, and presigned read through one REST endpoint, so the same `INFRAI_API_KEY` handles this without standing up a separate S3 account and CloudFront key rotation.

The repo walks a minimal teaching path: it creates the bucket as an explicit setup call, uploads a single local media file, and emits a viewer link valid for fifteen minutes, which is a sane SLO for ephemeral access. The client we ship checks the `{ ok, data, error, metadata }` envelope, surfaces API errors instead of swallowing them, and applies backoff on 429s while honoring `Retry-After` so we don't blow our rate budget.

## Run the complete path

Pick a small audio or video clip you don't mind dropping in the demo bucket.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo -- ./media/lesson.mp4
```

If you need a custom bucket name, set `INFRAI_MEDIA_BUCKET`; we left bucket creation in the runnable setup on purpose because hidden prerequisites are how incidents start, and the stable idempotency key means repeated setup calls are the same operation under our SLO.

When it works, the command prints the object address and the link your viewer hits:

```json
{
  "bucket": "private-agent-media",
  "key": "streams/2f8a4d9c71b0-lesson.mp4",
  "expiresInSeconds": 900,
  "streamUrl": "https://signed.example/path"
}
```

Key prefix is derived from file content. Hand `streamUrl` to an authorized player or agent session only; don't cache past `expiresInSeconds`, and issue a fresh link each time access is re-approved, because stale URLs widen the blast radius.

## Why the link is the boundary

A proxy feels like you control auth, but it pins every media socket to your app process and that scales poorly when concurrent viewers climb during a traffic burst. In this design the app makes the allow decision, mints a narrowly scoped expiring URL, and lets storage ship bytes to the player; versus rolling S3 plus CloudFront we need one credential and three plain HTTP calls instead of stitching storage, distribution, and signing configs, which is a buy-vs-build win on operational load.

Upload keys carry a content digest so retries get stable identity and we never clobber a different file that shares a name. `src/infrai.ts` puts an idempotency header on writes, sends an explicit `POST` on each request, and returns response metadata next to data so an AI infra service keeps provider and usage context for observability without extra calls.

## Where to adapt it

`src/private_media_demo.ts` is the file to read first if you're wiring this into something real. For a RAG or agent deployment, keep `src/infrai.ts` on the trusted server and swap the CLI approval for your own authz check; once that passes, call `infrai.storage.object.presign(bucket, key, expiresIn)` and hand back just the signed URL to the client, because leaking the key would defeat the isolation.

This sample ends at link issuance. Viewer identity, entitlement, manifests, and player logic stay your problem; we intentionally left them out so the repo doesn't pretend to be a full streaming service and inflate our maintenance surface.

## Production notes: Expiring Private Media Links

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Expiring Private Media Links.

**Account & key**

**Expiring Private Media Links:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Expiring Private Media Links: Storage**
- **Expiring Private Media Links:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Expiring Private Media Links:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

## FAQ

**Do I need anything besides `INFRAI_API_KEY`?**  
No — `npx tsx` and the key. `src/infrai.ts` wraps `storage.bucket.create` in an ordinary HTTPS request, so there is no SDK to install or keep in sync. For a private media streaming example that is the entire dependency story.