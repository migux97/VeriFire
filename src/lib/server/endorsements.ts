// The company signs each of its batches on Stellar, so the contract (not only this server) says who issued a product.
//
// Signing product by product would take hundreds of signatures. Instead the company signs once the Merkle root of the
// batch (endorse_batch), and this server then attaches the company to each product with its proof (link_issuer). The
// proof is checked by the contract against the product as it is stored there, so linking needs no signature and can
// only record what the company signed.
import type { EndorsementView } from '../types';
import { batchTree, productLeaf } from './batch-tree';
import { chain } from './chain';
import { HttpError } from './errors';
import { currentEndorsement, isCurrentOnChain } from './products';
import { singleton } from './singleton';
import { activationKeyFor, explorerTxUrl } from './stellar';
import { saveState, store, type Batch, type Product } from './store';

const leafOf = (product: Product) =>
  productLeaf({
    token: product.token,
    model: product.model,
    lot: product.lot,
    destination: product.destination,
    activationKey: activationKeyFor(product.secretCode ?? '')
  });

// Only once every product is in the contract: a product whose code changes while it is registered (see
// anchorPendingProducts) would otherwise leave the signature on a code that no longer exists.
const treeOf = (batch: Batch) => {
  if (!batch.tokens.length || !batch.tokens.every((product) => product.secretCode && isCurrentOnChain(product))) return null;
  return batchTree(batch.tokens.map(leafOf));
};

// Whether the deployed contract knows batch signatures, asked again every few minutes: it changes with an upgrade.
const support = singleton('endorsement-support', () => ({ value: false, at: 0 }));
const SUPPORT_TTL_MS = 5 * 60 * 1000;
const endorsementsSupported = async () => {
  if (!chain.enabled) return false;
  if (Date.now() - support.at > SUPPORT_TTL_MS) {
    support.value = await chain.supportsEndorsements();
    support.at = Date.now();
  }
  return support.value;
};

// Where the signature of a batch stands, for the company's panel.
export const endorsementView = async (batch: Batch | undefined): Promise<EndorsementView> => {
  const signed = currentEndorsement(batch);
  if (batch && signed) {
    return {
      status: 'signed',
      issuer: signed.issuer,
      txUrl: explorerTxUrl(signed.txHash),
      linked: batch.tokens.filter((product) => isCurrentOnChain(product) && product.chain.issuerTx !== undefined).length,
      total: batch.tokens.length
    };
  }
  if (!batch || !(await endorsementsSupported())) return { status: 'unavailable' };
  return treeOf(batch) ? { status: 'ready' } : { status: 'registering' };
};

const readyTree = async (batch: Batch | undefined) => {
  if (!batch) throw new HttpError(409, 'El lote todavía no existe: falta confirmar el pago.');
  if (currentEndorsement(batch)) throw new HttpError(409, 'Este lote ya está firmado.');
  if (!(await endorsementsSupported())) throw new HttpError(409, 'El contrato de Stellar todavía no admite la firma de lotes.');
  const tree = treeOf(batch);
  if (!tree) throw new HttpError(409, 'El lote todavía se está registrando en Stellar. Probá de nuevo en unos minutos.', { retryable: true });
  return tree;
};

// Writes on-chain which company VeriFire verified for a wallet (null withdraws it), next to what this server keeps.
// Best effort: the decision already stands here, and a contract that cannot take it yet is skipped.
export const publishIssuerVerification = (issuer: string, name: string | null) => {
  void (async () => {
    if (!(await endorsementsSupported())) return;
    await chain.setIssuerVerification(issuer, name);
  })().catch((error: unknown) => {
    console.error(`No se pudo escribir en Stellar la verificación de ${issuer}:`, error instanceof Error ? error.message : error);
  });
};

// The transaction the company's wallet signs.
export const prepareEndorsement = async (batch: Batch | undefined, issuer: string) => chain.buildEndorsement({ issuer, root: (await readyTree(batch)).root });

export const submitEndorsement = async (batch: Batch | undefined, issuer: string, signedXdr: string) => {
  const { root } = await readyTree(batch);
  const txHash = await chain.submitEndorsement({ issuer, root, signedXdr });
  const signed = batch as Batch;
  signed.endorsement = { root: root.toString('hex'), issuer, txHash, contractId: chain.contractId, at: new Date().toISOString() };
  saveState();
  linkEndorsedProducts();
  return endorsementView(signed);
};

// Links every product of a signed batch, one transaction each, paid by the issuing account. A failure is logged and
// retried on the next pass (a new signature, a newly registered product or a restart).
const linking = singleton('issuer-linking', () => ({ running: false, again: false }));

export const linkEndorsedProducts = () => {
  if (!chain.enabled) return;
  if (linking.running) {
    linking.again = true;
    return;
  }
  linking.running = true;
  void (async () => {
    do {
      linking.again = false;
      for (const batch of store.batches.values()) {
        const signed = currentEndorsement(batch);
        const tree = signed ? treeOf(batch) : null;
        if (!signed || !tree || tree.root.toString('hex') !== signed.root) continue;
        for (const [index, product] of batch.tokens.entries()) {
          if (!isCurrentOnChain(product) || product.chain.issuerTx !== undefined) continue;
          try {
            product.chain.issuerTx = await chain.linkIssuer({
              tokenId: product.chain.tokenId,
              root: tree.root,
              index,
              proof: tree.proofs[index] ?? []
            });
            saveState();
          } catch (error) {
            // A link whose answer was lost: the contract already names the company.
            const issuer = await chain.issuerOf(product.chain.tokenId).catch(() => null);
            if (issuer === signed.issuer) {
              product.chain.issuerTx = '';
              saveState();
              continue;
            }
            console.error(`No se pudo vincular ${product.token} con la empresa en Stellar:`, error instanceof Error ? error.message : error);
          }
        }
      }
    } while (linking.again);
  })().finally(() => {
    linking.running = false;
  });
};

// Links interrupted by a restart are retried when the server loads this module.
singleton('issuer-linking-on-start', () => {
  linkEndorsedProducts();
  return true;
});
