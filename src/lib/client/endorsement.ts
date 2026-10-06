// The company signs its batch on Stellar with its wallet (see endorsements.ts on the server): one signature for the
// whole batch, after which the contract names the company on every product.
import type { EndorsementView } from '../types';
import { postJson } from './api';
import { withCompanySession } from './company-session';
import { connectSigningWallet, resolveWalletAddress } from './wallet';

const FAILED = 'No se pudo firmar el lote en Stellar.';

const endorse = <T>(body: Record<string, unknown>) => withCompanySession(() => postJson<T>('/api/purchases/endorse', body, FAILED));

export const fetchEndorsement = async (purchaseId: string) => (await endorse<{ endorsement: EndorsementView }>({ purchaseId })).endorsement;

export const signBatch = async (appId: string, purchaseId: string, onProgress: (text: string) => void) => {
  onProgress('Conectando tu wallet Cavos...');
  const wallet = await connectSigningWallet(appId, await resolveWalletAddress(appId));
  const { xdr } = await endorse<{ xdr: string }>({ purchaseId, prepare: true });
  onProgress('Firmando el lote con tu wallet...');
  const signedXdr = await wallet.signXdr(xdr);
  onProgress('Registrando la firma en Stellar. Puede tardar unos segundos...');
  return (await endorse<{ endorsement: EndorsementView }>({ purchaseId, signedXdr })).endorsement;
};
