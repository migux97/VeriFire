// What a scanned QR turns out to be. A mistake here either turns away a legitimate buyer or treats the public code of
// a box as if it were the secret one that activates its warranty.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimFromLink, isTransferSecret, parseScannedQr, transferFromLink } from '../src/lib/qr-codes.ts';

test('the secret QR of a product carries an opaque key in the link', () => {
  assert.deepEqual(parseScannedQr('https://verifire.example/app#q=AbCdEfGhIjKlMA').claim, { qr: 'AbCdEfGhIjKlMA' });
  // Labels printed before the opaque key carried the code itself.
  assert.deepEqual(parseScannedQr('https://verifire.example/app?codigo=VF-SECRET-DEMO-001').claim, { secret: 'VF-SECRET-DEMO-001' });
  assert.deepEqual(claimFromLink('?secret=VF-SECRET-DEMO-001', ''), { secret: 'VF-SECRET-DEMO-001' });
});

test('the public QR of the box is not a way to activate the warranty', () => {
  const scanned = parseScannedQr('https://verifire.example/verify?token=VF-001');
  assert.equal(scanned.publicToken, 'VF-001');
  assert.equal(scanned.claim, null);
  assert.equal(scanned.transfer, null);
});

test('a transfer link is recognised by the secret it carries', () => {
  assert.equal(parseScannedQr('https://verifire.example/app#t=abcdefghijklmnop').transfer, 'abcdefghijklmnop');
  assert.equal(transferFromLink('#t=corto'), null, 'a secret that short was not created by a browser');
  assert.equal(transferFromLink('#t=' + 'a'.repeat(65)), null);
  assert.equal(transferFromLink('#q=AbCdEfGhIjKlMA'), null);
  assert.equal(isTransferSecret('abcdefghijklmnop'), true);
  assert.equal(isTransferSecret('con espacios aqui'), false);
});

test('text that is not a Verifire link is reported as nothing at all', () => {
  assert.deepEqual(parseScannedQr('hola'), { claim: null, publicToken: null, transfer: null });
  assert.deepEqual(parseScannedQr(''), { claim: null, publicToken: null, transfer: null });
  assert.deepEqual(parseScannedQr('https://otra.example/pagina'), { claim: null, publicToken: null, transfer: null });
});
