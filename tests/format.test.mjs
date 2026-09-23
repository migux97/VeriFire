// Shared formatting: what the panels show for an address, an amount and the time left on a transfer link.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCountdown, formatNumber, plural, shortAddress } from '../src/lib/format.ts';
import { isStellarAddress, normalizeId } from '../src/lib/validation.ts';

const ADDRESS = 'GBVVBO5QIKXK4PPKZUGJIIC3ZJXU2RLMJP7P6WZ7OOIVOBXPO4ACGYBZ';

test('a countdown never goes below zero and always shows two digits of seconds', () => {
  const now = Date.parse('2026-01-01T00:00:00.000Z');
  const inSeconds = (seconds) => new Date(now + seconds * 1000).toISOString();
  assert.equal(formatCountdown(inSeconds(245), now), '4:05');
  assert.equal(formatCountdown(inSeconds(60), now), '1:00');
  assert.equal(formatCountdown(inSeconds(0.4), now), '0:01');
  assert.equal(formatCountdown(inSeconds(-500), now), '0:00');
});

test('an address is shortened to its ends, and a missing one says so', () => {
  assert.equal(shortAddress(ADDRESS), 'GBVV…GYBZ');
  assert.equal(shortAddress(null), 'desconocido');
  assert.equal(shortAddress(''), 'desconocido');
});

test('amounts are grouped in the Argentine way', () => {
  assert.equal(formatNumber(1234.567), '1.234,57');
  assert.equal(formatNumber(1234.567, 1), '1.234,6');
  assert.equal(formatNumber(0), '0');
});

test('plural picks the word by count', () => {
  assert.equal(plural(1, 'lote', 'lotes'), 'lote');
  assert.equal(plural(0, 'lote', 'lotes'), 'lotes');
  assert.equal(plural(2, 'lote', 'lotes'), 'lotes');
});

test('only a real Stellar public key passes as one', () => {
  assert.equal(isStellarAddress(ADDRESS), true);
  assert.equal(isStellarAddress(ADDRESS.toLowerCase()), false);
  assert.equal(isStellarAddress(`${ADDRESS}X`), false);
  assert.equal(isStellarAddress(ADDRESS.slice(0, -1)), false);
  // Base32 has no 0, 1 or 8.
  assert.equal(isStellarAddress(`G0${ADDRESS.slice(2)}`), false);
  for (const value of [null, undefined, 7, {}, '']) assert.equal(isStellarAddress(value), false);
});

test('product codes are matched without case or stray spaces', () => {
  assert.equal(normalizeId(' vf-001 '), 'VF-001');
  assert.equal(normalizeId(null), '');
});
