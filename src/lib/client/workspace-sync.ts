// The company side of an account, shared with the server so another browser finds the same batches.
//
// Warranties already follow the wallet, because the contract records their owner. Purchases do not: their id is the
// key to the secret codes of a batch, so they were kept only in the browser that bought them. Here the wallet signs a
// nonce and the server answers with (and stores) that account's purchases and what kind of account it is.
import { bytesToBase64 } from './bytes';
import { postJson } from './api';
import { connectSigningWallet } from './wallet';

export interface RemoteWorkspace {
  owner: string;
  purchaseIds: string[];
  accountType: 'personal' | 'business' | null;
  companyName: string | null;
}

interface WorkspaceChanges {
  purchaseIds?: string[];
  removedPurchaseIds?: string[];
  accountType?: 'personal' | 'business';
  companyName?: string;
}

// Signing needs the wallet, which needs the Gmail confirmed: the panel keeps working on its own copy when it cannot.
export const syncWorkspace = async (appId: string, owner: string, changes: WorkspaceChanges = {}): Promise<RemoteWorkspace> => {
  const { nonce } = await postJson<{ nonce: string }>('/api/workspace/challenge', { owner }, 'No se pudo preparar la comprobación de tu wallet.');
  const wallet = await connectSigningWallet(appId, owner);
  const { signature, publicKey } = await wallet.signMessage(nonce);
  return postJson<RemoteWorkspace>(
    '/api/workspace',
    { owner, nonce, signature: bytesToBase64(signature), publicKey, ...changes },
    'No se pudo sincronizar tu cuenta de empresa.'
  );
};
