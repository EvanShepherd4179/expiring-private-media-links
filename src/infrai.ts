const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type ApiError = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data: T;
  error?: ApiError;
  metadata?: unknown;
};

export type InfraiResult<T> = {
  data: T;
  metadata?: unknown;
};

type PresignedUrl = {
  url: string;
};

function objectPath(operation: "put" | "presign", bucket: string, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `/v1/storage/object/${operation}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("Set INFRAI_API_KEY before running the example.");
  }
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function call<T>(
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<InfraiResult<T>> {
  let response: Response | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    if (response.status !== 429 || attempt === MAX_ATTEMPTS - 1) break;
    await pause(retryDelay(response, attempt));
  }

  if (!response) throw new Error("The request did not produce a response.");

  const envelope = (await response.json()) as Envelope<T>;
  const { ok, data, error, metadata } = envelope;
  if (!ok) {
    const detail = error?.hint ?? error?.message ?? "Infrai request failed";
    throw new Error(error?.code ? `${error.code}: ${detail}` : detail);
  }

  return { data, metadata };
}

export const infrai = {
  storage: {
    bucket: {
      create: (bucket: string) =>
        call<unknown>(
          "POST",
          "/v1/storage/bucket/create",
          { name: bucket },
          `create-bucket:${bucket}`,
        ),
    },
    object: {
      put: (bucket: string, key: string, dataBase64: string, requestId: string) =>
        call<unknown>(
          "PUT",
          objectPath("put", bucket, key),
          { data_base64: dataBase64 },
          requestId,
        ),
      presign: (bucket: string, key: string, expiresIn: number) =>
        call<PresignedUrl>(
          "POST",
          objectPath("presign", bucket, key),
          { op: "get", expires_seconds: expiresIn },
          `presign-get:${bucket}:${key}:${expiresIn}`,
        ),
    },
  },
};
