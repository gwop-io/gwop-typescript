/**
 * Test: Error code constants and isGwopError helper
 *
 * Validates the exported ErrorCode object, types, isGwopError helper,
 * and re-exports from @gwop/sdk/errors.
 *
 * Fully synthetic — no network calls.
 *
 * Run: npx tsx tests/12-error-codes.ts
 */

import { ErrorCode, ErrorResponse, GwopError, isGwopError, RateLimitError } from "../src/errors.js";
import { GwopDefaultError } from "../src/models/errors/gwop-default-error.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS — ${label}`);
    passed++;
  } else {
    console.error(`  FAIL — ${label}`);
    failed++;
  }
}

function fakeHttpMeta(status: number, body: string) {
  const response = new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
  const request = new Request("https://api.gwop.io/v1/test");
  return { response, request, body };
}

function fakeErrorResponse(code: string, message: string, status: number): ErrorResponse {
  const body = JSON.stringify({ error: { code, message } });
  return new ErrorResponse({ error: { code, message } }, fakeHttpMeta(status, body));
}

function fakeRateLimitError(): RateLimitError {
  const body = JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
  return new RateLimitError({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, fakeHttpMeta(429, body));
}

function fakeDefaultError(status: number, body: string): GwopDefaultError {
  return new GwopDefaultError("API error occurred", fakeHttpMeta(status, body));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Error code constants and isGwopError ===\n");

  // --- Test 1: ErrorCode object shape ---
  console.log("--- Test 1: ErrorCode object has all expected codes ---");
  const expected: Record<string, string> = {
    Unauthorized: "UNAUTHORIZED",
    Forbidden: "FORBIDDEN",
    ValidationError: "VALIDATION_ERROR",
    InvoiceNotFound: "INVOICE_NOT_FOUND",
    InvoiceCancelNotAllowed: "INVOICE_CANCEL_NOT_ALLOWED",
    AuthIntentNotSettled: "AUTH_INTENT_NOT_SETTLED",
    AuthIntentNotFound: "AUTH_INTENT_NOT_FOUND",
    AuthIntentExpired: "AUTH_INTENT_EXPIRED",
    AuthIntentUsed: "AUTH_INTENT_USED",
    SessionNotFound: "SESSION_NOT_FOUND",
    IdempotencyConflict: "IDEMPOTENCY_CONFLICT",
    RateLimited: "RATE_LIMITED",
  };
  for (const [key, value] of Object.entries(expected)) {
    assert((ErrorCode as Record<string, string>)[key] === value, `ErrorCode.${key} === "${value}"`);
  }
  assert(
    Object.keys(ErrorCode).length === Object.keys(expected).length,
    `ErrorCode has exactly ${Object.keys(expected).length} keys`,
  );

  // --- Test 2: isGwopError with ErrorResponse ---
  console.log("\n--- Test 2: isGwopError identifies ErrorResponse ---");
  const notFoundErr = fakeErrorResponse("INVOICE_NOT_FOUND", "Invoice not found", 404);
  assert(isGwopError(notFoundErr), "isGwopError(errorResponse) === true");
  assert(
    isGwopError(notFoundErr, ErrorCode.InvoiceNotFound),
    "isGwopError(errorResponse, ErrorCode.InvoiceNotFound) === true",
  );
  assert(
    !isGwopError(notFoundErr, ErrorCode.ValidationError),
    "isGwopError(errorResponse, ErrorCode.ValidationError) === false",
  );

  // --- Test 3: isGwopError with RateLimitError ---
  console.log("\n--- Test 3: isGwopError identifies RateLimitError ---");
  const rateLimitErr = fakeRateLimitError();
  assert(isGwopError(rateLimitErr), "isGwopError(rateLimitError) === true");
  assert(
    isGwopError(rateLimitErr, ErrorCode.RateLimited),
    "isGwopError(rateLimitError, ErrorCode.RateLimited) === true",
  );
  assert(
    !isGwopError(rateLimitErr, ErrorCode.Unauthorized),
    "isGwopError(rateLimitError, ErrorCode.Unauthorized) === false",
  );

  // --- Test 4: isGwopError rejects non-errors ---
  console.log("\n--- Test 4: isGwopError rejects non-errors ---");
  assert(!isGwopError(null), "isGwopError(null) === false");
  assert(!isGwopError(undefined), "isGwopError(undefined) === false");
  assert(!isGwopError(new Error("not gwop")), "isGwopError(Error) === false");
  assert(!isGwopError("string"), "isGwopError(string) === false");
  assert(!isGwopError({}), "isGwopError({}) === false");

  // --- Test 5: GwopError base class narrowing ---
  console.log("\n--- Test 5: isGwopError narrows to GwopError ---");
  const err = fakeErrorResponse("UNAUTHORIZED", "Invalid API key", 401);
  if (isGwopError(err)) {
    assert(typeof err.statusCode === "number", "narrowed err has statusCode");
    assert(err.statusCode === 401, "statusCode === 401");
    assert(err.headers instanceof Headers, "narrowed err has headers");
  } else {
    assert(false, "isGwopError should have returned true");
  }

  // --- Test 6: Re-exports are the real classes ---
  console.log("\n--- Test 6: Re-exports are actual classes ---");
  assert(typeof ErrorResponse === "function", "ErrorResponse is exported");
  assert(typeof RateLimitError === "function", "RateLimitError is exported");
  assert(typeof GwopError === "function", "GwopError is exported");
  assert(notFoundErr instanceof ErrorResponse, "instanceof ErrorResponse works");
  assert(notFoundErr instanceof GwopError, "instanceof GwopError works");
  assert(rateLimitErr instanceof RateLimitError, "instanceof RateLimitError works");
  assert(rateLimitErr instanceof GwopError, "RateLimitError instanceof GwopError");

  // --- Test 7: error.error.code matches data$.error.code ---
  console.log("\n--- Test 7: error.error.code === error.data$.error.code ---");
  assert(
    notFoundErr.error.code === notFoundErr.data$.error.code,
    "ErrorResponse: error.error.code === data$.error.code",
  );
  assert(
    rateLimitErr.error.code === rateLimitErr.data$.error.code,
    "RateLimitError: error.error.code === data$.error.code",
  );

  // --- Test 8: Body-parse fallback (GwopDefaultError with JSON body) ---
  console.log("\n--- Test 8: isGwopError body-parse fallback ---");
  const defaultErr = fakeDefaultError(
    429,
    JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests" } }),
  );
  assert(isGwopError(defaultErr), "isGwopError(defaultError) === true");
  assert(
    isGwopError(defaultErr, ErrorCode.RateLimited),
    "isGwopError(defaultError, ErrorCode.RateLimited) === true (body fallback)",
  );
  assert(
    !isGwopError(defaultErr, ErrorCode.Unauthorized),
    "isGwopError(defaultError, ErrorCode.Unauthorized) === false",
  );

  // --- Test 9: Non-JSON body doesn't crash ---
  console.log("\n--- Test 9: Non-JSON body fallback returns false ---");
  const htmlErr = fakeDefaultError(500, "Internal Server Error");
  assert(isGwopError(htmlErr), "isGwopError(htmlError) === true");
  assert(
    !isGwopError(htmlErr, ErrorCode.RateLimited),
    "isGwopError(htmlError, ErrorCode.RateLimited) === false (non-JSON body)",
  );

  // --- Test 10: .error property availability after isGwopError ---
  console.log("\n--- Test 10: .error availability differs by error class ---");

  // ErrorResponse has .error — structured path
  const structuredErr = fakeErrorResponse("VALIDATION_ERROR", "Bad request", 400);
  assert(isGwopError(structuredErr, ErrorCode.ValidationError), "structured: isGwopError matches");
  assert("error" in structuredErr, "structured: .error property exists");
  assert(structuredErr.error.code === "VALIDATION_ERROR", "structured: .error.code accessible");

  // GwopDefaultError does NOT have .error — fallback path
  const fallbackErr = fakeDefaultError(
    400,
    JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Bad request" } }),
  );
  assert(isGwopError(fallbackErr, ErrorCode.ValidationError), "fallback: isGwopError matches");
  assert(!("error" in fallbackErr), "fallback: .error property does NOT exist");

  // Prove that accessing .error.code on fallback path throws
  let fallbackCrashed = false;
  try {
    // @ts-expect-error — this is the exact mistake the docs were making
    const _code = (fallbackErr as any).error.code;
  } catch {
    fallbackCrashed = true;
  }
  assert(fallbackCrashed, "fallback: .error.code throws TypeError");

  // Both share the GwopError contract — statusCode, headers, body always work
  assert(structuredErr.statusCode === 400, "structured: .statusCode works");
  assert(fallbackErr.statusCode === 400, "fallback: .statusCode works");
  assert(typeof structuredErr.body === "string", "structured: .body works");
  assert(typeof fallbackErr.body === "string", "fallback: .body works");

  // --- Summary ---
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
