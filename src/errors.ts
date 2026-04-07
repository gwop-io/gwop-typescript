/**
 * Error code constants and helpers for @gwop/sdk.
 *
 * ```ts
 * import { ErrorCode, isGwopError } from "@gwop/sdk/errors";
 *
 * try {
 *   await gwop.invoices.get({ id });
 * } catch (err) {
 *   if (isGwopError(err, ErrorCode.InvoiceNotFound)) {
 *     // handle missing invoice
 *   }
 * }
 * ```
 *
 * @module
 */

import { ErrorResponse } from "./models/errors/error-response.js";
import { GwopError } from "./models/errors/gwop-error.js";
import { RateLimitError } from "./models/errors/rate-limit-error.js";
import type { ClosedEnum, OpenEnum } from "./types/enums.js";

export { ErrorResponse, GwopError, RateLimitError };

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Known Gwop API error codes.
 *
 * Use with `isGwopError()` for clean error handling:
 *
 * ```ts
 * if (isGwopError(err, ErrorCode.InvoiceNotFound)) { ... }
 * ```
 *
 * Or compare manually:
 *
 * ```ts
 * if (err instanceof ErrorResponse && err.error.code === ErrorCode.InvoiceNotFound) { ... }
 * ```
 */
export const ErrorCode = {
  /** 401 — Invalid, revoked, or missing API key. Check GWOP_MERCHANT_API_KEY. Do not retry. */
  Unauthorized: "UNAUTHORIZED",
  /** 403 — Valid key but merchant account not active. Contact support. Do not retry. */
  Forbidden: "FORBIDDEN",
  /** 400 — Request body failed validation. Check error.error.details for field-level info. */
  ValidationError: "VALIDATION_ERROR",
  /** 404 — Invoice doesn't exist or not visible to this merchant. Verify the invoice ID. */
  InvoiceNotFound: "INVOICE_NOT_FOUND",
  /** 400 — Cannot cancel — invoice is not OPEN. Check invoice status before canceling. */
  InvoiceCancelNotAllowed: "INVOICE_CANCEL_NOT_ALLOWED",
  /** 402 — Agent hasn't paid the auth challenge yet. Poll with backoff until paid or expired. */
  AuthIntentNotSettled: "AUTH_INTENT_NOT_SETTLED",
  /** 404 — Auth intent doesn't exist. Verify the intent ID or create a new one. */
  AuthIntentNotFound: "AUTH_INTENT_NOT_FOUND",
  /** 409 — Auth intent TTL exceeded. Create a new auth intent — the agent took too long. */
  AuthIntentExpired: "AUTH_INTENT_EXPIRED",
  /** 409 — Auth intent already exchanged. Use the JWT from the first exchange. */
  AuthIntentUsed: "AUTH_INTENT_USED",
  /** 404 — Session doesn't exist. It may have been revoked or expired. */
  SessionNotFound: "SESSION_NOT_FOUND",
  /** 409 — Idempotency key reused with different parameters. Use a fresh crypto.randomUUID(). */
  IdempotencyConflict: "IDEMPOTENCY_CONFLICT",
  /** 429 — Too many requests. Back off and check Retry-After header via err.headers. */
  RateLimited: "RATE_LIMITED",
} as const;

/**
 * Any of the 12 known error codes.
 * Use for exhaustive switches where you want the compiler to flag unhandled codes.
 */
export type KnownErrorCode = ClosedEnum<typeof ErrorCode>;

/**
 * Any known error code, or an unrecognized string from the backend.
 * Use as the default type for error code variables — forward-compatible
 * if the backend adds new codes before the SDK ships a constant.
 */
export type ErrorCode = OpenEnum<typeof ErrorCode>;

// ---------------------------------------------------------------------------
// isGwopError
// ---------------------------------------------------------------------------

/**
 * Check whether an unknown value is a Gwop SDK HTTP error.
 *
 * Without a code argument, narrows `err` to `GwopError` (gives access to
 * `statusCode`, `headers`, `body`).
 *
 * With a code argument, narrows to `GwopError` and additionally checks
 * that the error's code matches. Works on structured errors (`ErrorResponse`,
 * `RateLimitError`) via `.error.code`, and on generic errors
 * (`GwopDefaultError`) by parsing the raw response body.
 *
 * @example
 * ```ts
 * import { ErrorCode, isGwopError } from "@gwop/sdk/errors";
 *
 * if (isGwopError(err, ErrorCode.InvoiceNotFound)) {
 *   // err is narrowed to GwopError
 * }
 *
 * if (isGwopError(err)) {
 *   console.log(err.statusCode); // any SDK HTTP error
 * }
 * ```
 */
export function isGwopError(err: unknown): err is GwopError;
export function isGwopError(err: unknown, code: ErrorCode): err is GwopError;
export function isGwopError(err: unknown, code?: string): boolean {
  if (!(err instanceof GwopError)) return false;
  if (code === undefined) return true;

  // Structured error classes — .error.code is a typed property
  if (err instanceof ErrorResponse) return err.error.code === code;
  if (err instanceof RateLimitError) return err.error.code === code;

  // Fallback: parse raw body for generic GwopError/GwopDefaultError.
  // Covers operations where the matcher falls through to M.fail("4XX").
  try {
    const parsed = JSON.parse(err.body);
    return parsed?.error?.code === code;
  } catch {
    return false;
  }
}
