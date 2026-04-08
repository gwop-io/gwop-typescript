/*
 * Webhook signature verification.
 *
 * Verifies HMAC-SHA256 signatures on incoming webhook requests,
 * then parses the body into typed event objects.
 *
 * Signing format (matches gwop-backend/src/webhooks/webhooks.service.ts):
 *   HMAC-SHA256("{timestamp}.{raw_body}", webhook_secret) → hex
 *   Header: t={timestamp},v1={hex}
 *
 * Uses Web Crypto API for cross-runtime compatibility (Node, Deno, Bun, Edge).
 */

import type { GwopCore } from "../core.js";
import { SDKValidationError } from "../models/errors/sdk-validation-error.js";
import * as webhooks from "../models/webhooks/index.js";
import { ERR, type Result } from "../types/fp.js";

const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes

export async function validateWebhook(
  _client: GwopCore,
  {
    request: rawRequest,
  }: {
    request:
      | {
          body: BodyInit;
          method: string;
          url: string;
          headers: Record<string, string> | Headers;
        }
      | Request;
  },
): Promise<
  Result<
    webhooks.InvoicePaidWebhookRequest | webhooks.InvoiceExpiredWebhookRequest | webhooks.InvoiceCanceledWebhookRequest,
    SDKValidationError
  >
> {
  const secret = resolveSecret(_client);
  const request = normalizeRequest(rawRequest);

  // Extract headers
  const signatureHeader = request.headers.get("x-gwop-signature");
  const eventId = request.headers.get("x-gwop-event-id");
  const eventType = request.headers.get("x-gwop-event-type");

  if (!signatureHeader) {
    return ERR(
      new SDKValidationError(
        "Missing X-Gwop-Signature header",
        "Missing X-Gwop-Signature header",
        "Missing X-Gwop-Signature header",
      ),
    );
  }

  // Read raw body
  const rawBody = await request.text();

  // Verify HMAC signature
  const verifyResult = await verifySignature(rawBody, signatureHeader, secret);
  if (!verifyResult.ok) {
    return ERR(new SDKValidationError(verifyResult.error, verifyResult.error, rawBody));
  }

  // Build the combined object that the Zod schemas expect:
  // headers are top-level fields alongside the parsed body
  const combined = JSON.stringify({
    "X-Gwop-Signature": signatureHeader,
    "X-Gwop-Event-Id": eventId ?? "",
    "X-Gwop-Event-Type": eventType ?? "",
    body: JSON.parse(rawBody),
  });

  // Try each webhook schema
  const knownSchemas = [
    webhooks.invoicePaidWebhookRequestFromJSON,
    webhooks.invoiceExpiredWebhookRequestFromJSON,
    webhooks.invoiceCanceledWebhookRequestFromJSON,
  ];

  for (const schema of knownSchemas) {
    const ret = schema(combined);
    if (ret.ok) {
      // Reject payloads where critical fields were coerced to empty string
      // by the permissive types.string() parser (e.g. missing from wire payload).
      const data = ret.value.body.data;
      if (!data.invoiceId || !data.publicInvoiceId || !data.merchantId) {
        continue;
      }
      return ret;
    }
  }

  return ERR(
    new SDKValidationError(`No matching webhook schema for event type: ${eventType ?? "unknown"}`, combined, rawBody),
  );
}

function resolveSecret(client: GwopCore): string {
  const secret = client._options.webhookSecret || readWebhookSecretFromEnv();
  if (!secret) {
    throw new SDKValidationError(
      "webhookSecret is required for validateWebhook(). Pass it in the Gwop constructor or set the GWOP_WEBHOOK_SECRET environment variable.",
      "webhookSecret is required",
      "webhookSecret is required",
    );
  }
  return secret;
}

function readWebhookSecretFromEnv(): string | undefined {
  if ("Deno" in globalThis) {
    return (globalThis as any).Deno?.env?.get?.("GWOP_WEBHOOK_SECRET") ?? undefined;
  }

  if ("process" in globalThis) {
    return (globalThis as any).process?.env?.GWOP_WEBHOOK_SECRET ?? undefined;
  }

  return undefined;
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Parse: t=<timestamp>,v1=<sig1>,v1=<sig2>,...
  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const signatureParts = parts.filter((p) => p.startsWith("v1="));

  if (!timestampPart || signatureParts.length === 0) {
    return { ok: false, error: "Malformed X-Gwop-Signature header" };
  }

  const timestamp = parseInt(timestampPart.slice(2), 10);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, error: "Invalid webhook timestamp" };
  }

  // Timestamp tolerance (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return {
      ok: false,
      error: `Webhook timestamp outside tolerance window (${toleranceSeconds}s)`,
    };
  }

  // Compute expected HMAC using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const expectedMac = hexEncode(new Uint8Array(mac));

  // Check any v1= signature matches (supports key rotation)
  const valid = signatureParts.some((part) => {
    const candidate = part.slice(3);
    return secureCompare(candidate, expectedMac);
  });

  if (!valid) {
    return { ok: false, error: "Webhook signature verification failed" };
  }

  return { ok: true };
}

/** Constant-time string comparison to prevent timing attacks. */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function hexEncode(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

function normalizeRequest(
  request:
    | {
        body: BodyInit;
        method: string;
        url: string;
        headers: Record<string, string> | Headers;
      }
    | Request,
): Request {
  if (request instanceof Request) {
    return request;
  }
  return new Request(request.url, request);
}
