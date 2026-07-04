// Helpers for reading x402 protocol headers without paying.

export interface QuotedPrice {
  maxAmountRequired: string; // token motes as decimal string
  network: string;
  asset?: string;
  raw: unknown;
}

/** Decode the base64 PAYMENT-REQUIRED header from a 402 response. */
export function decodePaymentRequired(headerValue: string | null): QuotedPrice | null {
  if (!headerValue) return null;
  try {
    const json = JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
    const accepts: any[] = Array.isArray(json?.accepts) ? json.accepts : [];
    const first = accepts[0];
    if (!first) return null;
    const amount = String(
      first.maxAmountRequired ?? first.max_amount_required ?? first.amount ?? "",
    );
    if (!amount) return null;
    return {
      maxAmountRequired: amount,
      network: String(first.network ?? ""),
      asset: first.asset ? String(first.asset) : undefined,
      raw: json,
    };
  } catch {
    return null;
  }
}

/** Best-effort extraction of a transaction hash from a settle response object. */
export function extractTxHash(settle: unknown): string | undefined {
  if (!settle || typeof settle !== "object") return undefined;
  const s = settle as Record<string, unknown>;
  for (const k of ["transaction", "txHash", "transactionHash", "deployHash", "hash"]) {
    const v = s[k];
    if (typeof v === "string" && v.length >= 32) return v;
  }
  return undefined;
}

export function motesToTokens(motes: string | bigint, decimals = 9): string {
  const m = BigInt(motes);
  const base = 10n ** BigInt(decimals);
  const whole = m / base;
  const frac = (m % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
