// What a person may type or scan to activate a warranty. A mistake here either turns away a legitimate buyer or lets
// a public code through as if it were the secret one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseManualCode, parseScannedQr } from '../src/lib/qr-codes.ts';

const ACTIVATION_URL = 'https://verifire.example/app#q=AbCdEfGhIjKlMA';

test('the printed secret code is accepted in any case and stored upper case', () => {
  assert.deepEqual(parseManualCode('VF-SECRET-0123456789ABCDEF0123'), { secret: 'VF-SECRET-0123456789ABCDEF0123' });
  assert.deepEqual(parseManualCode('  vf-secret-demo-001  '), { secret: 'VF-SECRET-DEMO-001' });
});

test('a secret with the wrong shape is not accepted', () => {
  for (const value of ['VF-SECRET-123', 'VF-SECRET-0123456789ABCDEFZZZZ', 'VF-SECRET-DEMO-01', 'VF-0123456789ABCDEF0123', '']) {
    assert.equal(parseManualCode(value), null, value);
  }
});

test('the activation link is read as the opaque key it carries', () => {
  assert.deepEqual(parseManualCode(ACTIVATION_URL), { qr: 'AbCdEfGhIjKlMA' });
  assert.deepEqual(parseManualCode('.abc-DEF_123'), { qr: '.abc-DEF_123' });
});

test('the public QR of the box is not a way to activate the warranty', () => {
  assert.equal(parseManualCode('https://verifire.example/verify?token=VF-001'), null);
  assert.equal(parseScannedQr('https://verifire.example/verify?token=VF-001').publicToken, 'VF-001');
  assert.equal(parseScannedQr('https://verifire.example/verify?token=VF-001').claim, null);
});

test('input that is not a code at all, and input long enough to be an attack, are rejected', () => {
  assert.equal(parseManualCode('hola'), null);
  assert.equal(parseManualCode('VF-SECRET-0123456789ABCDEF0123'.padEnd(2049, 'X')), null);
  assert.equal(parseManualCode(''), null);
});

test('a scanned link that is neither a claim nor a public token is reported as nothing', () => {
  assert.deepEqual(parseScannedQr('no es una url'), { claim: null, publicToken: null, transfer: null });
  assert.deepEqual(parseScannedQr('https://verifire.example/app#t=abcdefghijklmnop'),
    { claim: null, publicToken: null, transfer: 'abcdefghijklmnop' });
});
