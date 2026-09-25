// When a company counts as verified: only after an administrator approved it, and only while it keeps showing the name
// that was checked.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isVerified, sameName, verificationView } from '../src/lib/server/verification.ts';

const brand = (name) => ({ slug: 'x', name, updatedAt: '2026-01-01T00:00:00Z' });
const workspace = (verification, brandName) => ({
  owner: 'G'.padEnd(56, 'A'),
  purchaseIds: [],
  ...(brandName ? { brand: brand(brandName) } : {}),
  ...(verification ? { verification } : {}),
  updatedAt: '2026-01-01T00:00:00Z'
});
const approved = { status: 'verified', name: 'Andes Audio', decidedAt: '2026-01-02T00:00:00Z' };

test('names are compared without caring for case, accents or spaces', () => {
  assert.equal(sameName('Andes Audio', '  andes   AUDIO '), true);
  assert.equal(sameName('Café Único', 'cafe unico'), true);
  assert.equal(sameName('Andes Audio', 'Andes Tec'), false);
  assert.equal(sameName('Apple', 'Apple Store'), false);
});

test('a company is verified only after being approved', () => {
  assert.equal(isVerified(undefined), false);
  assert.equal(isVerified(workspace(undefined, 'Andes Audio')), false);
  assert.equal(isVerified(workspace({ status: 'pending' }, 'Andes Audio')), false);
  assert.equal(isVerified(workspace({ status: 'rejected', note: 'no' }, 'Andes Audio')), false);
  assert.equal(isVerified(workspace(approved, 'Andes Audio')), true);
});

test('a verified company that shows another name stops being verified', () => {
  assert.equal(isVerified(workspace(approved, 'andes audio')), true);
  assert.equal(isVerified(workspace(approved, 'Apple Store')), false);
  // Without a published brand, the verified name is what buyers read.
  assert.equal(isVerified(workspace(approved)), true);
  // An approval without the name that was checked counts for nothing.
  assert.equal(isVerified(workspace({ status: 'verified' }, 'Andes Audio')), false);
});

test('what the company reads about its verification', () => {
  assert.deepEqual(verificationView(undefined), { status: 'none', active: false });
  const paused = verificationView(workspace(approved, 'Apple Store'));
  assert.equal(paused.status, 'verified');
  assert.equal(paused.active, false);
  // The reason of a rejection is for the company; nothing else of the administrator's decision is.
  const rejected = verificationView(workspace({ status: 'rejected', note: 'El CUIT no coincide.', by: 'GADMIN' }));
  assert.equal(rejected.note, 'El CUIT no coincide.');
  assert.equal('by' in rejected, false);
  assert.equal('note' in verificationView(workspace({ ...approved, note: 'interna' })), false);
});
