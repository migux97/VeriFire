// The cookie that remembers a wallet's signature: it speaks only for the wallet it was issued to, and only until it
// expires.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSession, signSession } from '../src/lib/server/session-token.ts';

const key = 'a'.repeat(64);
const owner = 'G'.padEnd(56, 'A');
const other = 'G'.padEnd(56, 'B');
const now = 1_800_000_000_000;

test('a token issued by this server names its wallet until it expires', () => {
  const token = signSession(key, owner, now + 1000);
  assert.equal(readSession(key, token, now), owner);
  assert.equal(readSession(key, token, now + 1000), null);
});

test('a token signed with another key is refused', () => {
  assert.equal(readSession(key, signSession('b'.repeat(64), owner, now + 1000), now), null);
});

test('changing the wallet or the expiry breaks the token', () => {
  const [, until, signature] = signSession(key, owner, now + 1000).split('.');
  assert.equal(readSession(key, `${other}.${until}.${signature}`, now), null);
  assert.equal(readSession(key, `${owner}.${now + 10_000_000}.${signature}`, now), null);
});

test('missing or malformed tokens are refused', () => {
  for (const token of [undefined, '', 'x', `${owner}.1`, `${owner}.${now + 1000}.sig.extra`, `not-a-wallet.${now + 1000}.sig`]) {
    assert.equal(readSession(key, token, now), null);
  }
});
