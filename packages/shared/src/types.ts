export interface PurchaseReport {
  kind: "purchase";
  buyerId: string;
  endpointId: string;
  priceMotes: string;
  valuationMotes?: string;
  txHash?: string;
  network?: string;
  payer?: string;
  raw?: unknown;
  at: number;
}

export interface BalkReport {
  kind: "balk";
  buyerId: string;
  endpointId: string;
  priceMotes: string;
  valuationMotes: string;
  at: number;
}

export interface AttestationReport {
  kind: "attestation";
  endpointId: string;
  oldPriceMotes: string;
  newPriceMotes: string;
  statsHash: string;
  seq?: number;
  txHash?: string;
  narration?: string;
  windowStats?: WindowStats;
  at: number;
}

export interface WindowStats {
  endpointId: string;
  fromMs: number;
  toMs: number;
  priceMotes: string;
  observations: number; // purchases + balks
  purchases: number;
  balks: number;
  revenueMotes: string;
}
