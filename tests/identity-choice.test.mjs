// Which Cavos login signs for the account signed in: never another account's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseIdentity } from '../src/lib/client/identity-choice.ts';

const fran = { email: 'fran@gmail.com', cavosUserId: 'user-fran' };

test('the login saved by Cavos is used when it is this account\'s', () => {
  const restored = { userId: 'user-fran', email: 'Fran@Gmail.com' };
  assert.deepEqual(chooseIdentity(restored, fran, 'fran@gmail.com'), { identity: restored, foreign: false });
});

test('a login without an email is taken as this account\'s, as before', () => {
  const restored = { userId: 'user-x' };
  assert.deepEqual(chooseIdentity(restored, fran, 'fran@gmail.com'), { identity: restored, foreign: false });
});

test('another account\'s login is not used: the saved user id of this account takes its place', () => {
  const restored = { userId: 'user-migu', email: 'migu@gmail.com' };
  assert.deepEqual(chooseIdentity(restored, fran, 'fran@gmail.com'), { identity: { userId: 'user-fran', email: 'fran@gmail.com' }, foreign: true });
});

test('another account\'s login and no saved user id: nobody signs, and the login must be confirmed again', () => {
  const restored = { userId: 'user-migu', email: 'migu@gmail.com' };
  assert.deepEqual(chooseIdentity(restored, { email: 'fran@gmail.com' }, 'fran@gmail.com'), { identity: null, foreign: true });
});

test('without a Cavos login, the account\'s own saved user id is used only for the account signed in', () => {
  assert.deepEqual(chooseIdentity(null, fran, 'fran@gmail.com'), { identity: { userId: 'user-fran', email: 'fran@gmail.com' }, foreign: false });
  assert.deepEqual(chooseIdentity(null, fran, 'otro@gmail.com'), { identity: null, foreign: false });
  assert.deepEqual(chooseIdentity(null, null, ''), { identity: null, foreign: false });
});
