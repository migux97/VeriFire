import type { IssuanceOptions } from '../issuance';
// Products, batches and purchases, kept in memory and saved to a JSON file after every change.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config';
import { singleton } from './singleton';

export interface ProductFields {
  configuration?: IssuanceOptions;
  model: string;
  lot: string;
  destination: string;
}

// Events stored as they happen. Registration and activation come from the product's own fields (see historyOf).
export interface StoredEvent {
  kind: 'shipped' | 'verified' | 'rejected' | 'transferred';
  at: string;
  tx?: string;
  // Transfers: previous and new owner. Rejected claims: the account that tried.
  from?: string;
  to?: string;
  by?: string;
}

export interface Product extends ProductFields {
  tokenId: number;
  token: string;
  batchId?: string;
  // Absent only on the seed product, which keeps the local demo claim.
  secretCode?: string;
  secretHash: string;
  claimed: boolean;
  owner: string | null;
  createdAt?: string;
  claimedAt?: string;
  claimTransaction?: string;
  // Hex public key derived from the secret code (see activationKeyOf).
  activationKey?: string;
  // Set once the product is registered in the Stellar contract. contractId is missing on records made before
  // contracts were replaced: those belong to STELLAR_PREVIOUS_CONTRACT_ID, or to the current one if it is not set.
  chain?: { tokenId: number; mintTx: string; contractId?: string; at?: string };
  events?: StoredEvent[];
  // Open transfer link: the public key of its secret, who offered it and when it expires.
  transfer?: { key: string; from: string; offeredAt: string; expiresAt?: string };
}

export interface Batch extends ProductFields {
  batchId: string;
  tokens: Product[];
  amount: string;
  txHash: string | null;
  shippedAt?: string;
}

export interface Purchase extends ProductFields {
  purchaseId: string;
  quantity: number;
  total: string;
  intentId: string;
  createdAt?: string;
  paymentQr: string | null;
  paymentUri: string | null;
  batchId?: string;
  txHash?: string | null;
}

// Same format the file has always had: batches list their products by token.
interface SavedState {
  nextTokenId?: number;
  nextBatchId?: number;
  products?: Product[];
  batches?: (Omit<Batch, 'tokens'> & { tokens: string[] })[];
  purchases?: Purchase[];
}

export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

const createState = () => {
  const state = {
    nextTokenId: 2,
    nextBatchId: 1,
    products: new Map<string, Product>([
      ['VF-001', {
        tokenId: 1,
        token: 'VF-001',
        model: 'Smartwatch X9 Pro',
        lot: '1043',
        destination: 'Argentina · LATAM',
        secretHash: hashSecret('VF-SECRET-DEMO-001'),
        claimed: false,
        owner: null
      }]
    ]),
    batches: new Map<string, Batch>(),
    purchases: new Map<string, Purchase>()
  };

  const readSaved = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as SavedState;
  let saved: SavedState;
  try {
    saved = readSaved(config.dataFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return state;
    // A file cut in half by a crash during a write: the copy left by the previous save is still whole.
    try {
      saved = readSaved(`${config.dataFile}.bak`);
      console.warn(`${config.dataFile} está dañado: se cargó la copia anterior ${config.dataFile}.bak.`);
    } catch {
      throw new Error(`No se pudo leer ${config.dataFile}. Revisalo o borralo antes de iniciar el servidor.`, { cause: error });
    }
  }
  for (const product of saved.products ?? []) state.products.set(product.token, product);
  for (const batch of saved.batches ?? []) {
    const tokens = batch.tokens.map((token) => state.products.get(token)).filter((product) => product !== undefined);
    state.batches.set(batch.batchId, { ...batch, tokens });
  }
  for (const purchase of saved.purchases ?? []) state.purchases.set(purchase.purchaseId, purchase);
  state.nextTokenId = Math.max(state.nextTokenId, Number(saved.nextTokenId) || 0);
  state.nextBatchId = Math.max(state.nextBatchId, Number(saved.nextBatchId) || 0);
  return state;
};

export const store = singleton('store', createState);

export const saveState = () => {
  const saved: SavedState = {
    nextTokenId: store.nextTokenId,
    nextBatchId: store.nextBatchId,
    products: [...store.products.values()],
    batches: [...store.batches.values()].map((batch) => ({ ...batch, tokens: batch.tokens.map((product) => product.token) })),
    purchases: [...store.purchases.values()]
  };
  // Written beside the file and renamed over it: a rename is atomic, so a crash leaves either the previous state or
  // the new one, never half of either. The previous file is kept as .bak for the case where the disk itself lied.
  const temporary = `${config.dataFile}.tmp`;
  try {
    mkdirSync(dirname(config.dataFile), { recursive: true });
    writeFileSync(temporary, JSON.stringify(saved, null, 2));
    if (existsSync(config.dataFile)) renameSync(config.dataFile, `${config.dataFile}.bak`);
    renameSync(temporary, config.dataFile);
  } catch (error) {
    // The caller answers the request anyway, so what it just promised the user has to be visible in the log.
    console.error('No se pudo guardar el estado de Verifire:', error);
    throw new Error('No se pudo guardar el cambio. Intentá de nuevo en unos segundos.', { cause: error });
  }
};
