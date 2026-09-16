// Shapes of the JSON the API answers with. Shared by the server that builds them and the pages that read them.

export type ProductStatus = 'SEALED' | 'CLAIMED_IN_WARRANTY';

export interface ApiErrorBody {
  error: string;
  retryable?: boolean;
}

// What the QR on the outside of the box shows to anyone, without a session: no owner and no links.
export interface PublicProduct {
  token: string;
  model: string;
  lot: string;
  destination: string;
  status: ProductStatus;
  claimed: boolean;
  claimedAt: string | null;
  warrantyUntil: string | null;
  network: string;
  blockchainBacked: boolean;
}

export interface Warranty extends PublicProduct {
  tokenId: number;
  owner: string | null;
  // The activation transaction signed by the issuing account: the only on-chain record a buyer ever sees.
  certificateUrl: string | null;
  verificationUrl: string;
  activationUrl: string;
  contractId: string | null;
  chainTokenId: number | null;
}

// Answer of POST /api/products, the only one that carries the secret code of a single product.
export interface MintedProduct extends Warranty {
  secretCode?: string;
  secretUrl?: string;
}

export interface WarrantiesResponse {
  owner: string;
  warranties: Warranty[];
}

export interface BatchToken {
  token: string;
  status: ProductStatus;
}

// A public QR for the outside of the box and a secret QR for the inside.
export interface ProductLabel extends BatchToken {
  secretCode: string;
  secretUrl: string;
  secretQr: string;
  publicUrl: string;
  publicQr: string;
}

interface BatchBase {
  batchId: string;
  quantity: number;
  model: string;
  lot: string;
  destination: string;
  publicUrl: string;
  network: string;
  blockchainBacked: boolean;
}

export interface PublicBatch extends BatchBase {
  tokens: BatchToken[];
}

// What the batch cost is company data: it travels only with the secret codes, never on the public lot page.
export interface CompanyBatch extends BatchBase {
  publicQr: string;
  tokens: ProductLabel[];
  payment: { amount: string; asset: 'XLM'; pricePerToken: string };
}

// What the company's list of batches shows for a purchase: no secret codes and no QR images.
export interface PurchaseSummary {
  purchaseId: string;
  model: string;
  lot: string;
  destination: string;
  quantity: number;
  amount: string;
  asset: 'XLM';
  createdAt: string | null;
  batchId: string | null;
  // The payment QR, kept so a pending purchase can be paid from the list. Null once the batch exists.
  payment: { qr: string | null; uri: string | null } | null;
  issuanceTxUrl: string | null;
  registeredOnChain: number;
  pendingOnChain: number;
  claimed: number;
}

export type PurchaseStatus =
  | { status: string; succeeded: false; txHash?: string | null; purchase: PurchaseSummary }
  | { status: 'succeeded'; succeeded: true; paymentValidated: true; purchase: PurchaseSummary; batch?: CompanyBatch };

export interface CreatedPurchase {
  purchaseId: string;
  quantity: number;
  amount: string;
  asset: string;
  intentId: string;
  status: string;
  network: string;
  uri: string;
  qr: string;
}

export interface CountryOption {
  code: string;
  name: string;
  region: string;
  // Printed on the labels, e.g. "Argentina · LATAM".
  destination: string;
}

export type PreparedClaim = { onChain: false } | { onChain: true; message: string; feeAccount: string };
