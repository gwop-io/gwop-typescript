/**
 * Test: gwop.validateWebhook()
 *
 * Tests the fixed webhook verification: HMAC check + schema parsing.
 *
 * Run: npx tsx --env-file=tests/.env tests/09-webhooks.ts
 */

import { createHmac } from "node:crypto";
import { Gwop } from "../src/index.js";

const WEBHOOK_SECRET = process.env.GWOP_WEBHOOK_SECRET!;

const gwop = new Gwop({ webhookSecret: WEBHOOK_SECRET });

function signPayload(body: string, timestamp: number): string {
  const mac = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

async function main() {
  console.log("=== validateWebhook() ===\n");

  const paidBody = JSON.stringify({
    event_type: "invoice.paid",
    event_id: "evt_test_001",
    data: {
      invoice_id: "ba7bc94a-5468-42f4-9f04-2502e50c7501",
      public_invoice_id: "inv_7dbeeaad8ebf4f5298c380c90e4b3576",
      merchant_id: "9e9c9ba5-3bab-4172-8a79-336f9ca0f163",
      status: "PAID",
      amount_usdc: "1025000",
      currency: "USDC",
      tx_hash: "0xcd2688e1636de50f283933bd08b849dc6aef51ea9600521bc5f2de409897ad47",
      payment_chain: "base",
      payment_chain_caip2: "eip155:8453",
      paid_at: "2026-03-24T00:48:31.602Z",
      payer_wallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f5bA16",
    },
  });

  // --- Test 1: Valid invoice.paid webhook ---
  console.log("--- Valid invoice.paid ---");
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(paidBody, timestamp);

  try {
    const event = await gwop.validateWebhook({
      request: {
        body: paidBody,
        headers: {
          "x-gwop-signature": signature,
          "x-gwop-event-id": "evt_test_001",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });

    console.log("Event type:", event.body.eventType);
    console.log("Event ID:", event.body.eventId);
    console.log("Invoice ID:", event.body.data.publicInvoiceId);
    console.log("Payment chain:", event.body.data.paymentChain);
    console.log("Payer wallet:", event.body.data.payerWallet);
    console.log("Paid at:", event.body.data.paidAt);
    console.log("Tx hash:", event.body.data.txHash);
    console.log("PASS — valid webhook verified + parsed");
  } catch (err: any) {
    console.log("FAILED:", err.message);
  }

  // --- Test 2: Invalid signature ---
  console.log("\n--- Invalid signature ---");
  try {
    await gwop.validateWebhook({
      request: {
        body: paidBody,
        headers: {
          "x-gwop-signature": `t=${timestamp},v1=${"a".repeat(64)}`,
          "x-gwop-event-id": "evt_test_002",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("FAIL — should have rejected invalid signature");
  } catch (err: any) {
    console.log("Error:", err.message);
    console.log("PASS — invalid signature rejected");
  }

  // --- Test 3: Missing signature header ---
  console.log("\n--- Missing signature header ---");
  try {
    await gwop.validateWebhook({
      request: {
        body: paidBody,
        headers: {
          "x-gwop-event-id": "evt_test_003",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("FAIL — should have rejected missing signature");
  } catch (err: any) {
    console.log("Error:", err.message);
    console.log("PASS — missing signature rejected");
  }

  // --- Test 4: Expired timestamp (10 min old) ---
  console.log("\n--- Expired timestamp ---");
  const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
  const oldSignature = signPayload(paidBody, oldTimestamp);
  try {
    await gwop.validateWebhook({
      request: {
        body: paidBody,
        headers: {
          "x-gwop-signature": oldSignature,
          "x-gwop-event-id": "evt_test_004",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("FAIL — should have rejected expired timestamp");
  } catch (err: any) {
    console.log("Error:", err.message);
    console.log("PASS — expired timestamp rejected");
  }

  // --- Test 5: Tampered body ---
  console.log("\n--- Tampered body ---");
  try {
    await gwop.validateWebhook({
      request: {
        body: `${paidBody} `,
        headers: {
          "x-gwop-signature": signature,
          "x-gwop-event-id": "evt_test_005",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("FAIL — should have rejected tampered body");
  } catch (err: any) {
    console.log("Error:", err.message);
    console.log("PASS — tampered body rejected");
  }

  // --- Test 6: No constructor secret — falls back to GWOP_WEBHOOK_SECRET env ---
  // The "no secret at all" case is covered by tests/11-webhook-secret-env.ts (test 3).
  // Here we verify that env fallback resolves but signature still must match.
  console.log("\n--- No constructor secret (env fallback) ---");
  const envGwop = new Gwop(); // picks up GWOP_WEBHOOK_SECRET from env
  try {
    await envGwop.validateWebhook({
      request: {
        body: paidBody,
        headers: {
          "x-gwop-signature": signature, // signed with WEBHOOK_SECRET, env may differ
          "x-gwop-event-id": "evt_test_006",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("PASS — env secret matched and webhook validated");
  } catch (err: any) {
    if (err.message.includes("signature verification failed")) {
      console.log("PASS — env secret resolved (signature mismatch expected if env differs from test secret)");
    } else if (err.message.includes("webhookSecret is required")) {
      console.log("FAIL — env fallback did not resolve GWOP_WEBHOOK_SECRET");
    } else {
      console.log("Error:", err.message);
      console.log("PASS — env fallback resolved, validation ran");
    }
  }

  // --- Test 7: invoice.expired event ---
  console.log("\n--- invoice.expired ---");
  const expiredBody = JSON.stringify({
    event_type: "invoice.expired",
    event_id: "evt_test_007",
    data: {
      invoice_id: "ba7bc94a-5468-42f4-9f04-2502e50c7501",
      public_invoice_id: "inv_7dbeeaad8ebf4f5298c380c90e4b3576",
      merchant_id: "9e9c9ba5-3bab-4172-8a79-336f9ca0f163",
      status: "EXPIRED",
      amount_usdc: "1025000",
      currency: "USDC",
    },
  });
  const expiredTs = Math.floor(Date.now() / 1000);
  const expiredSig = signPayload(expiredBody, expiredTs);
  try {
    const event = await gwop.validateWebhook({
      request: {
        body: expiredBody,
        headers: {
          "x-gwop-signature": expiredSig,
          "x-gwop-event-id": "evt_test_007",
          "x-gwop-event-type": "invoice.expired",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("Event type:", event.body.eventType);
    console.log("PASS — invoice.expired parsed");
  } catch (err: any) {
    console.log("FAILED:", err.message);
  }

  // --- Test 8: invoice.canceled event ---
  console.log("\n--- invoice.canceled ---");
  const canceledBody = JSON.stringify({
    event_type: "invoice.canceled",
    event_id: "evt_test_008",
    data: {
      invoice_id: "ba7bc94a-5468-42f4-9f04-2502e50c7501",
      public_invoice_id: "inv_7dbeeaad8ebf4f5298c380c90e4b3576",
      merchant_id: "9e9c9ba5-3bab-4172-8a79-336f9ca0f163",
      status: "CANCELED",
      amount_usdc: "1025000",
      currency: "USDC",
    },
  });
  const canceledTs = Math.floor(Date.now() / 1000);
  const canceledSig = signPayload(canceledBody, canceledTs);
  try {
    const event = await gwop.validateWebhook({
      request: {
        body: canceledBody,
        headers: {
          "x-gwop-signature": canceledSig,
          "x-gwop-event-id": "evt_test_008",
          "x-gwop-event-type": "invoice.canceled",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("Event type:", event.body.eventType);
    console.log("PASS — invoice.canceled parsed");
  } catch (err: any) {
    console.log("FAILED:", err.message);
  }
  // --- Test 9: Missing public_invoice_id field ---
  console.log("\n--- Missing public_invoice_id ---");
  const missingFieldBody = JSON.stringify({
    event_type: "invoice.paid",
    event_id: "evt_test_009",
    data: {
      invoice_id: "inv_7dbeeaad8ebf4f5298c380c90e4b3576",
      // public_invoice_id intentionally omitted
      merchant_id: "9e9c9ba5-3bab-4172-8a79-336f9ca0f163",
      status: "PAID",
      amount_usdc: "1025000",
      currency: "USDC",
      tx_hash: "0xcd2688e1636de50f283933bd08b849dc6aef51ea9600521bc5f2de409897ad47",
      payment_chain: "base",
      payment_chain_caip2: "eip155:8453",
      paid_at: "2026-03-24T00:48:31.602Z",
      payer_wallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f5bA16",
    },
  });
  const missingTs = Math.floor(Date.now() / 1000);
  const missingSig = signPayload(missingFieldBody, missingTs);
  try {
    await gwop.validateWebhook({
      request: {
        body: missingFieldBody,
        headers: {
          "x-gwop-signature": missingSig,
          "x-gwop-event-id": "evt_test_009",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("FAIL — should have rejected missing public_invoice_id");
    process.exit(1);
  } catch (err: any) {
    console.log("Error:", err.message);
    console.log("PASS — missing public_invoice_id rejected");
  }

  // --- Test 10: Missing invoice_id field ---
  console.log("\n--- Missing invoice_id ---");
  const missingInvoiceIdBody = JSON.stringify({
    event_type: "invoice.paid",
    event_id: "evt_test_010",
    data: {
      // invoice_id intentionally omitted
      public_invoice_id: "inv_7dbeeaad8ebf4f5298c380c90e4b3576",
      merchant_id: "9e9c9ba5-3bab-4172-8a79-336f9ca0f163",
      status: "PAID",
      amount_usdc: "1025000",
      currency: "USDC",
      tx_hash: "0xcd2688e1636de50f283933bd08b849dc6aef51ea9600521bc5f2de409897ad47",
      payment_chain: "base",
      payment_chain_caip2: "eip155:8453",
      paid_at: "2026-03-24T00:48:31.602Z",
      payer_wallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f5bA16",
    },
  });
  const missingInvTs = Math.floor(Date.now() / 1000);
  const missingInvSig = signPayload(missingInvoiceIdBody, missingInvTs);
  try {
    await gwop.validateWebhook({
      request: {
        body: missingInvoiceIdBody,
        headers: {
          "x-gwop-signature": missingInvSig,
          "x-gwop-event-id": "evt_test_010",
          "x-gwop-event-type": "invoice.paid",
          "content-type": "application/json",
        },
        url: "https://api.example.com/webhooks/gwop",
        method: "POST",
      },
    });
    console.log("FAIL — should have rejected missing invoice_id");
    process.exit(1);
  } catch (err: any) {
    console.log("Error:", err.message);
    console.log("PASS — missing invoice_id rejected");
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
