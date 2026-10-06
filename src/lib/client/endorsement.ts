// The company signs each of its batches on Stellar with its wallet (see endorsements.ts on the server): one signature
// for the whole batch, after which the contract names the company on every product. The panel does it on its own as
// soon as the batch exists, with the wallet this browser already holds: the company never sees a button or a message.
import type { EndorsementView } from '../types';
import { postJson } from './api';
import { withCompanySession } from './company-session';
import { connectSigningWallet, resolveWalletAddress } from './wallet';

const FAILED = 'No se pudo firmar el lote en Stellar.';

const endorse = <T>(body: Record<string, unknown>) => withCompanySession(() => postJson<T>('/api/purchases/endorse', body, FAILED));

const fetchEndorsement = async (purchaseId: string) => (await endorse<{ endorsement: EndorsementView }>({ purchaseId })).endorsement;

const signBatch = async (appId: string, purchaseId: string) => {
  const wallet = await connectSigningWallet(appId, await resolveWalletAddress(appId));
  const { xdr } = await endorse<{ xdr: string }>({ purchaseId, prepare: true });
  const signedXdr = await wallet.signXdr(xdr);
  await endorse<{ endorsement: EndorsementView }>({ purchaseId, signedXdr });
};

// Each batch is tried once per page load, one at a time: a batch that could not be signed now (the browser cannot
// sign yet, Stellar did not answer, the panel was closed) is tried again the next time the company opens its panel.
const tried = new Set<string>();
let queue = Promise.resolve();

// `onSigned` runs once this browser signed the batch, so the panel can show the signature.
export const signBatchInBackground = (appId: string, purchaseId: string, onSigned?: () => void) => {
  if (tried.has(purchaseId)) return;
  tried.add(purchaseId);
  queue = queue.then(async () => {
    try {
      if ((await fetchEndorsement(purchaseId)).status !== 'ready') return;
      await signBatch(appId, purchaseId);
      onSigned?.();
    } catch (error) {
      console.warn(`No se pudo firmar el lote de ${purchaseId} en Stellar; se reintenta al volver a abrir el panel:`, error);
    }
  });
};
