// Self-hosted x402 facilitator for Casper testnet.
// Ported from make-software/casper-x402 js/examples/facilitator (Apache-2.0)
// and trimmed for Ọjà. Swap FACILITATOR_URL in .env to use the sponsored
// buildathon facilitator instead of running this.
import "@oja/shared/src/env.ts";
import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/facilitator";
import { toFacilitatorCasperSigner } from "@make-software/casper-x402";
import casperSdk from "casper-js-sdk";
import express from "express";
import { env, envInt } from "@oja/shared/src/env.ts";

const { KeyAlgorithm, PrivateKey } = casperSdk;

const PORT = envInt("FACILITATOR_PORT", 4022);
const NETWORKS = env("CASPER_NETWORKS", "casper:casper-test")
  .split(",")
  .map(n => n.trim())
  .filter(Boolean);
const PAYMENT_MOTES = envInt("TRANSACTION_PAYMENT_MOTES", 7_000_000_000);

function suffix(network: string): string {
  return network.toUpperCase().replace(/[:\-]/g, "_");
}
function normalizePEM(pem: string): string {
  return pem.replace(/\\n/g, "\n").replace(/\r/g, "");
}

const app = express();
app.use(express.json());

const facilitator = new x402Facilitator();

for (const network of NETWORKS) {
  const sfx = suffix(network);
  const pem = normalizePEM(env(`SECRET_KEY_PEM_${sfx}`));
  const rpcUrl = env(`RPCURL_${sfx}`);
  const algoRaw = (process.env[`SECRET_KEY_ALGO_${sfx}`] || "ed25519").toLowerCase();
  const algorithm = algoRaw === "secp256k1" ? KeyAlgorithm.SECP256K1 : KeyAlgorithm.ED25519;
  const privateKey = PrivateKey.fromPem(pem, algorithm);
  const signer = await toFacilitatorCasperSigner(privateKey, rpcUrl);
  facilitator.register(
    network as any,
    new ExactCasperScheme(signer, { limitedPaymentMotes: PAYMENT_MOTES }),
  );
  console.log(`[facilitator] ${network} ready (algo=${algoRaw}, rpc=${rpcUrl})`);
}

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements);
    res.json(response);
  } catch (error) {
    console.error("[facilitator] verify error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: SettleResponse = await facilitator.settle(paymentPayload, paymentRequirements);
    console.log("[facilitator] settled:", JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error("[facilitator] settle error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/supported", async (_req, res) => {
  try {
    res.json(facilitator.getSupported());
  } catch (error) {
    console.error("[facilitator] supported error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[facilitator] listening on http://localhost:${PORT}`));
