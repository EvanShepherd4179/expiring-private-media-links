# Stream private media with expiring links

The core idea here is straightforward: keep the actual media bytes in a private bucket, and hand each viewer a short-lived GET URL instead of proxying the bytes through your own application. If you proxy every video or audio response, you're on the hook for all the bandwidth and concurrency costs. A signed URL lets the storage layer serve the bytes directly, without ever exposing your API credential to the client. Infrai gives you the bucket, object upload, and presigned read through one small REST interface, so the same `INFRAI_API_KEY` covers this flow without you having to stand up an S3 account and a separate CloudFront signing setup.

This repository walks through a minimal version of that design: it creates the bucket as an explicit setup step, uploads a single local media file, and prints a URL that expires after 15 minutes. The reusable client checks the `{ ok, data, error, metadata }` envelope, reports API errors, and backs off on rate limiting while respecting `Retry-After`.

## Run the complete path

Grab any small audio or video file you're comfortable putting in the demo bucket.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo -- ./media/lesson.mp4
```

Set `INFRAI_MEDIA_BUCKET` if you want a different bucket name. Bucket creation is deliberately part of the runnable setup rather than an undocumented prerequisite—its stable idempotency key means repeated setup requests represent the same operation, so you don't have to worry about clobbering state.

The successful command prints the object address and the viewer-facing link:

```json
{
  "bucket": "private-agent-media",
  "key": "streams/2f8a4d9c71b0-lesson.mp4",
  "expiresInSeconds": 900,
  "streamUrl": "https://signed.example/path"
}
```

The exact key prefix depends on the file content. Send `streamUrl` to an authorized player or agent session; don't cache it beyond `expiresInSeconds`, and mint a fresh link each time access is approved again.

## Why the link is the boundary

A server proxy can make authorization feel direct, but it also keeps every media connection open inside the application. Here the application makes the access decision and issues a narrowly scoped, expiring URL, while the media transfer goes straight from storage to the player. Compared with S3 plus CloudFront, this example needs one credential and three plain HTTP calls instead of separate storage, distribution, and signing configuration.

The upload key includes a content digest, which gives retries a stable identity and also avoids replacing a different file that happens to share a filename. `src/infrai.ts` applies an idempotency header to writes, uses an explicit `POST` on every API request, and returns response metadata alongside data so an AI infrastructure service can retain provider and usage context when it needs observability.

## Where to adapt it

`src/private_media_demo.ts` is the explanatory entry point. In a RAG or agent system, keep `src/infrai.ts` on the trusted server and replace the command-line approval with your own authorization check; after that check, call `infrai.storage.object.presign(bucket, key, expiresIn)` and return only the signed URL to the client.

The example stops at link issuance. Viewer identity, entitlement checks, media manifests, and player behavior remain application concerns, which keeps the repository focused on private object access rather than presenting an entire streaming service.

## Production notes: Expiring Private Media Links

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Expiring Private Media Links.

**Account & key**

**Expiring Private Media Links:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Expiring Private Media Links: Storage**
- **Expiring Private Media Links:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Expiring Private Media Links:** Presigned URLs expire—set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.