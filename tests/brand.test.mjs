// What a company may publish about itself: the identifier of its brand and the checks on what it sends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEmail, isPhone, isPngDataUrl, isWebsite, slugify } from '../src/lib/brand.ts';

// A real 1x1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('the slug is lower case, without accents, spaces or symbols', () => {
  assert.equal(slugify('Andes Tech'), 'andes-tech');
  assert.equal(slugify('  Andes   Tech S.A.  '), 'andes-tech-s-a');
  assert.equal(slugify('Perfumería Río de la Plata'), 'perfumeria-rio-de-la-plata');
  assert.equal(slugify('¡¡Ñandú & Cía!!'), 'nandu-cia');
});

test('a name with nothing usable still gets a slug, and a long one is cut cleanly', () => {
  assert.equal(slugify('***'), 'empresa');
  assert.equal(slugify(''), 'empresa');
  const long = slugify('a'.repeat(30) + ' ' + 'b'.repeat(30));
  assert.ok(long.length <= 40);
  assert.ok(!long.endsWith('-'));
});

test('the slug is stable for the same name', () => {
  assert.equal(slugify('Andes Tech'), slugify('andes  TECH'));
});

test('only a real PNG is accepted as a logo', () => {
  assert.equal(isPngDataUrl(PNG), true);
  assert.equal(isPngDataUrl(PNG.replace('image/png', 'image/jpeg')), false);
  assert.equal(isPngDataUrl('data:image/png;base64,AAAA'), false, 'the bytes are not a PNG signature');
  assert.equal(isPngDataUrl('https://example.com/logo.png'), false);
  assert.equal(isPngDataUrl(''), false);
  assert.equal(isPngDataUrl(PNG + 'A'.repeat(60_000)), false, 'too big for the request');
});

test('emails, phones and websites are checked before they are shown to buyers', () => {
  assert.equal(isEmail('soporte@andestech.com'), true);
  assert.equal(isEmail('soporte@andestech'), false);
  assert.equal(isEmail('con espacio@x.com'), false);
  assert.equal(isPhone('+54 11 1234-5678'), true);
  assert.equal(isPhone('(011) 4321 0000'), false, 'starts with a parenthesis');
  assert.equal(isPhone('abc'), false);
  assert.equal(isWebsite('https://andestech.com'), true);
  assert.equal(isWebsite('andestech.com'), false);
  assert.equal(isWebsite('javascript:alert(1)'), false);
});
