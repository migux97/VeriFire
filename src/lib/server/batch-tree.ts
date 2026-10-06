// The Merkle tree a company signs for a whole batch (see endorse_batch and link_issuer in the contract). Each leaf is
// one product exactly as the contract stores it, so the signature covers what the public QR page shows: the code,
// the model, the lot, the destination and the key of the sealed QR.
//
// Imports nothing of the app, so the tests (and scripts/) load it on its own.
import { createHash } from 'node:crypto';
import { nativeToScVal } from '@stellar/stellar-sdk';

export interface BatchLeafFields {
  token: string;
  model: string;
  lot: string;
  destination: string;
  // ed25519 public key derived from the secret QR (32 bytes).
  activationKey: Buffer;
}

const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest();
const xdrString = (value: string) => Buffer.from(nativeToScVal(value, { type: 'string' }).toXDR());

// Same bytes as product_leaf in the contract: 0x00, the XDR of each text, then the key.
export const productLeaf = ({ token, model, lot, destination, activationKey }: BatchLeafFields) =>
  sha256(Buffer.from([0]), xdrString(token), xdrString(model), xdrString(lot), xdrString(destination), activationKey);

const node = (left: Buffer, right: Buffer) => sha256(Buffer.from([1]), left, right);

// Root of the batch and the proof of each leaf, in the order given. The leaves are padded with zeros up to a power of
// two, so every proof has the same length and a position decides the side of each sibling.
export const batchTree = (leaves: Buffer[]) => {
  if (!leaves.length) throw new Error('Un lote sin productos no tiene raíz.');
  let level = [...leaves];
  while (level.length & (level.length - 1)) level.push(Buffer.alloc(32));
  const proofs: Buffer[][] = leaves.map(() => []);
  const positions = leaves.map((_, index) => index);
  while (level.length > 1) {
    positions.forEach((position, leaf) => {
      proofs[leaf]?.push(level[position ^ 1] as Buffer);
      positions[leaf] = position >> 1;
    });
    const next: Buffer[] = [];
    for (let index = 0; index < level.length; index += 2) next.push(node(level[index] as Buffer, level[index + 1] as Buffer));
    level = next;
  }
  return { root: level[0] as Buffer, proofs };
};

// Whether `proof` leads from `leaf` at `index` to `root`, checked the way the contract does.
export const verifyProof = (leaf: Buffer, index: number, proof: Buffer[], root: Buffer) => {
  let current = leaf;
  let position = index;
  for (const sibling of proof) {
    current = position & 1 ? node(sibling, current) : node(current, sibling);
    position >>= 1;
  }
  return position === 0 && current.equals(root);
};
