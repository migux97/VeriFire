// The photo of a batch: what counts as an image the server keeps and shows to everyone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHOTO_LIMIT, photoFormat, photoMime } from '../src/lib/photo.ts';

const bytes = (...values) => Buffer.from(values).toString('base64');
// Only the first bytes matter here: the check is on the format the file says it is and starts with.
const JPEG = `data:image/jpeg;base64,${bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1)}`;
const PNG = `data:image/png;base64,${bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)}`;
const WEBP = `data:image/webp;base64,${Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1').toString('base64')}`;

test('accepts a JPEG, a PNG and a WebP that start like one', () => {
  assert.equal(photoFormat(JPEG), 'jpeg');
  assert.equal(photoFormat(PNG), 'png');
  assert.equal(photoFormat(WEBP), 'webp');
  assert.equal(photoMime('jpeg'), 'image/jpeg');
});

test('refuses a file that says it is one thing and starts like another', () => {
  assert.equal(photoFormat(JPEG.replace('image/jpeg', 'image/png')), null);
  assert.equal(photoFormat(PNG.replace('image/png', 'image/webp')), null);
  // A RIFF file that is not a WebP (a WAV, for example).
  const wav = `data:image/webp;base64,${Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1').toString('base64')}`;
  assert.equal(photoFormat(wav), null);
});

test('refuses what is not an image or not a data URL', () => {
  assert.equal(photoFormat('https://example.com/photo.jpg'), null);
  assert.equal(photoFormat('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), null);
  assert.equal(photoFormat('data:text/html;base64,PGh0bWw+'), null);
  assert.equal(photoFormat('data:image/jpeg;base64,'), null);
  assert.equal(photoFormat('data:image/jpeg;base64,/9j/ no base64'), null);
  assert.equal(photoFormat(''), null);
});

test('refuses a photo over the limit', () => {
  const big = `${JPEG}${'A'.repeat(PHOTO_LIMIT)}`;
  assert.equal(photoFormat(big), null);
});
