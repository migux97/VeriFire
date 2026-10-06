// The tree a company signs for a batch must match the contract byte for byte (see leaf_matches_the_server in
// contracts/verifire_product/src/lib.rs), and every product must prove its place in it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batchTree, productLeaf, verifyProof } from '../src/lib/server/batch-tree.ts';

const fields = (token) => ({ token, model: 'Smartwatch X9', lot: '1043', destination: 'AR', activationKey: Buffer.alloc(32, 7) });

test('a leaf is the same one the contract builds', () => {
  assert.equal(productLeaf(fields('VF-050')).toString('hex'), 'c826d0efbdd7681d652a279d240b9450c585f3c8463081db85dbb0800751ec1f');
});

test('every product of a batch proves its place, whatever the size', () => {
  for (const size of [1, 2, 3, 5, 8, 13]) {
    const leaves = Array.from({ length: size }, (_, index) => productLeaf(fields(`VF-${index}`)));
    const { root, proofs } = batchTree(leaves);
    leaves.forEach((leaf, index) => assert.ok(verifyProof(leaf, index, proofs[index], root), `size ${size}, product ${index}`));
  }
});

test('a proof does not work for another product or another position', () => {
  const leaves = ['VF-A', 'VF-B', 'VF-C'].map((token) => productLeaf(fields(token)));
  const { root, proofs } = batchTree(leaves);
  assert.equal(verifyProof(leaves[1], 0, proofs[0], root), false);
  assert.equal(verifyProof(leaves[0], 1, proofs[0], root), false);
  assert.equal(verifyProof(productLeaf({ ...fields('VF-A'), model: 'Otro' }), 0, proofs[0], root), false);
});

test('changing any product changes the root', () => {
  const leaves = ['VF-A', 'VF-B'].map((token) => productLeaf(fields(token)));
  const changed = [leaves[0], productLeaf({ ...fields('VF-B'), lot: '1044' })];
  assert.notDeepEqual(batchTree(leaves).root, batchTree(changed).root);
});
