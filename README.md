# gwop

Infrastructure for agent-native commerce. Turn AI agents into customers.

[![npm](https://img.shields.io/npm/v/@gwop/sdk)](https://www.npmjs.com/package/@gwop/sdk)
[![CI](https://github.com/gwop-io/gwop-node/actions/workflows/ci.yml/badge.svg)](https://github.com/gwop-io/gwop-node/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)]()

Gwop gives merchants the missing commerce layer for selling to AI agents. Authenticate agents by wallet, sell subscriptions and credits with USDC, and manage customers — all headless, all API-first.

## What merchants build

Gwop is designed for **headless, agent-native stores** — no browser, no UI, no human in the loop:

- **Credit-based APIs** — Sell prepaid credits, enforce usage limits, track consumption per agent
- **Subscription services** — Plans with tiered access, daily caps, and model restrictions
- **One-time purchases** — Reports, datasets, API packages, or any digital good
- **Agent marketplaces** — Multi-tenant platforms where agents discover, buy, and use services

**Live example:** [AgentRouter](https://agentrouter.lol) ([skill.md](https://agentrouter.lol/skill.md)) — a headless LLM inference store built entirely on Gwop.

### Why not raw x402?

Raw x402 gives you stateless per-request payments. Gwop gives you **customers**:

| Raw x402 | With Gwop |
|----------|-----------|
| Anonymous wallet hits endpoint | Authenticated agent with identity and session |
| Pay per request, every request | Authenticate once, charge upfront, usage flows smoothly |
| No concept of who paid before | Account history, entitlements, plan enforcement |
| Merchant builds auth + billing | One SDK: auth, checkout, webhooks, treasury |

## Get a merchant account

You need a Gwop merchant account to get API keys, merchant wallets, and webhook secrets.

- **Apply:** [merchant.gwop.io/apply](https://merchant.gwop.io/apply)
- **Email:** hello@gwop.io
- **X:** [@gwop_io](https://x.com/gwop_io)

## Install

```bash
npm install @gwop/sdk
# or
yarn add @gwop/sdk
# or
pnpm add @gwop/sdk
# or
bun add @gwop/sdk
```

> ESM only. For CommonJS projects, use `await import("@gwop/sdk")`.

## Quick start

Add your credentials to `.env` — find these in your [merchant dashboard](https://merchant.gwop.io) under **Settings**:

```bash
GWOP_MERCHANT_API_KEY=sk_m_...   # Settings → API Keys → + Create
GWOP_WEBHOOK_SECRET=whsec_...    # Settings → Webhook Configuration → Secret
```

```typescript
import { Gwop } from "@gwop/sdk";

const gwop = new Gwop(); // reads GWOP_MERCHANT_API_KEY from env

// Create an invoice
const { result: invoice } = await gwop.invoices.create({
  idempotencyKey: crypto.randomUUID(),
  body: {
    amountUsdc: 5_000_000, // $5.00 USDC (6 decimals)
    description: "Starter plan — 300 credits",
    metadata: { planId: "starter" },
  },
});

// Hand the payment URL to the agent
console.log(invoice.publicInvoiceId); // inv_7dbeeaad8ebf...
console.log(invoice.agentProtocol);   // Machine-readable payment instructions

// Check payment status
const { result: status } = await gwop.invoices.get({
  id: invoice.publicInvoiceId,
});
console.log(status.status); // "OPEN" → "PAYING" → "PAID"
```

## Authenticate agents

Identify agents by wallet using a x402 authentication challenge:

```typescript
// 1. Create an auth challenge ($0.001 USDC dust payment)
const { result: intent } = await gwop.authIntents.create({
  idempotencyKey: crypto.randomUUID(),
});

// 2. Agent pays → exchange for a JWT
const { result: token } = await gwop.authIntents.exchange({
  authIntentId: intent.authIntentId,
  idempotencyKey: crypto.randomUUID(),
});

console.log(token.accessToken);          // RS256-signed JWT
console.log(token.principal.sub);        // "base:0x742d..." or "solana:7sSi..."
console.log(token.account.isNewAccount); // true on first auth
```

Your backend calls these endpoints with `sk_m_*` keys. Agents never talk to Gwop directly — only your backend does. See [full auth docs](https://docs.gwop.io) for JWT verification, session management, and JWKS.

## Webhooks

```typescript
const gwop = new Gwop(); // reads GWOP_WEBHOOK_SECRET from env

const event = await gwop.validateWebhook({
  request: {
    body: rawBody,
    headers: {
      "x-gwop-signature": req.headers["x-gwop-signature"],
      "x-gwop-event-id": req.headers["x-gwop-event-id"],
      "x-gwop-event-type": req.headers["x-gwop-event-type"],
      "content-type": "application/json",
    },
    url: `https://${req.headers.host}${req.originalUrl}`,
    method: "POST",
  },
});

switch (event.body.eventType) {
  case "invoice.paid":    // funds received
  case "invoice.expired": // invoice TTL reached
  case "invoice.canceled": // merchant canceled
}
```

> Use the raw body for verification. Re-stringified JSON will break the HMAC signature. Works in Node.js, Deno, Bun, and edge runtimes.

## API reference

### Invoices

| Method | Description |
|--------|-------------|
| `gwop.invoices.create()` | Create an invoice for agent payment |
| `gwop.invoices.list()` | List invoices with pagination and status filter |
| `gwop.invoices.get()` | Get the public invoice view (takes `publicInvoiceId`) |
| `gwop.invoices.cancel()` | Cancel an open invoice (takes merchant UUID `id`) |

### Auth

| Method | Description |
|--------|-------------|
| `gwop.authIntents.create()` | Create a wallet auth challenge |
| `gwop.authIntents.exchange()` | Exchange settled intent for JWT (402 if unpaid) |
| `gwop.authSessions.get()` | Get session status |
| `gwop.authSessions.revoke()` | Revoke a session (logout) |
| `gwop.auth.getJwks()` | Fetch JWKS for local JWT verification |

### Webhooks

| Method | Description |
|--------|-------------|
| `gwop.validateWebhook()` | Verify HMAC signature + parse typed event |

## Errors

All errors use `UPPER_SNAKE_CASE` codes. Build your error handling against codes, not HTTP status or message strings — codes are stable across SDK versions.

```typescript
import * as errors from "@gwop/sdk/models/errors";

try {
  await gwop.invoices.create({ /* ... */ });
} catch (error) {
  if (error instanceof errors.ErrorResponse) {
    console.log(error.data$.error.code);   // "VALIDATION_ERROR"
    console.log(error.data$.error.message); // Human-readable description
    console.log(error.statusCode);          // 400
  }
}
```

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Invalid, revoked, or missing API key |
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `INVOICE_NOT_FOUND` | 404 | Invoice doesn't exist or not visible to this merchant |
| `INVOICE_CANCEL_NOT_ALLOWED` | 400 | Cannot cancel — invoice is not `OPEN` |
| `AUTH_INTENT_NOT_SETTLED` | 402 | Agent hasn't paid the auth challenge yet |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key reused with different parameters |
| `RATE_LIMITED` | 429 | Too many requests — check `Retry-After` header |

## Configuration

```typescript
const gwop = new Gwop({
  merchantApiKey: "sk_m_...",   // or set GWOP_MERCHANT_API_KEY env var
  webhookSecret: "whsec_...",   // or set GWOP_WEBHOOK_SECRET env var
  timeoutMs: 30_000,            // request timeout
  debugLogger: console,         // or set GWOP_DEBUG=true
});
```

The SDK retries failed requests with exponential backoff automatically. All methods return `{ headers, result }`. See [docs.gwop.io](https://docs.gwop.io) for retry configuration, response shapes, and advanced usage.

## Concepts

### Two invoice IDs

Every invoice has two identifiers:

| Field | Format | Used by |
|-------|--------|---------|
| `id` | UUID (`ba7bc94a-...`) | Your backend — list, cancel, internal references |
| `publicInvoiceId` | `inv_*` (`inv_7dbeeaad...`) | Payers and agents — get invoice, payment URLs |

### Platform fee

The backend adds a 2.5% platform fee to `amountUsdc`. A request for `5_000_000` ($5.00) results in an invoice total of `5_125_000` ($5.125). The fee breakdown is injected into `metadata` automatically.

## Links

- **Docs:** [docs.gwop.io](https://docs.gwop.io)
- **Apply for access:** [merchant.gwop.io/apply](https://merchant.gwop.io/apply)
- **Support:** hello@gwop.io
- **X:** [@gwop_io](https://x.com/gwop_io)

---

Built by the Gwop team. MIT License.
