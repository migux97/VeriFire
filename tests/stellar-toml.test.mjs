// The stellar.toml a company downloads: the right table, escaped values, and nothing written that it cannot back up.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStellarToml, tomlString } from '../src/lib/stellar-toml.ts';

const full = {
  commercialName: 'Andes Tech',
  legalName: 'Andes Tech S.A.',
  website: 'https://andestech.com',
  description: 'Fabricante de auriculares',
  officialEmail: 'contacto@andestech.com',
  supportEmail: 'soporte@andestech.com',
  logoUrl: 'https://verifire.example/api/brand/andes-tech/logo.png'
};

test('the organization fields go inside [DOCUMENTATION], one per line', () => {
  const { text, included } = buildStellarToml(full);
  assert.match(text, /\n\[DOCUMENTATION\]\n/);
  assert.ok(text.includes('ORG_NAME = "Andes Tech S.A."'));
  assert.ok(text.includes('ORG_DBA = "Andes Tech"'));
  assert.ok(text.includes('ORG_URL = "https://andestech.com"'));
  assert.ok(text.includes('ORG_LOGO = "https://verifire.example/api/brand/andes-tech/logo.png"'));
  assert.ok(text.includes('ORG_DESCRIPTION = "Fabricante de auriculares"'));
  assert.ok(text.includes('ORG_OFFICIAL_EMAIL = "contacto@andestech.com"'));
  assert.ok(text.includes('ORG_SUPPORT_EMAIL = "soporte@andestech.com"'));
  assert.deepEqual(included, ['ORG_NAME', 'ORG_DBA', 'ORG_URL', 'ORG_LOGO', 'ORG_DESCRIPTION', 'ORG_OFFICIAL_EMAIL', 'ORG_SUPPORT_EMAIL']);
});

test('without a legal name the trade name is the name of the organization, and there is no DBA', () => {
  const { text } = buildStellarToml({ ...full, legalName: '' });
  assert.ok(text.includes('ORG_NAME = "Andes Tech"'));
  assert.doesNotMatch(text, /^ORG_DBA =/m);
});

test('a key with no data is left out and reported, never written empty', () => {
  const { text, omitted } = buildStellarToml({ ...full, website: '', description: '' });
  // The header comment names ORG_URL, so what counts is a line that sets it.
  assert.doesNotMatch(text, /^ORG_URL =/m);
  assert.doesNotMatch(text, /^ORG_DESCRIPTION =/m);
  assert.deepEqual(omitted.map((item) => item.key), ['ORG_URL', 'ORG_DESCRIPTION']);
});

test('a logo that is not https is left out: wallets only load it over https', () => {
  const { text, omitted } = buildStellarToml({ ...full, logoUrl: 'http://localhost:5501/api/brand/andes-tech/logo.png' });
  assert.doesNotMatch(text, /^ORG_LOGO =/m);
  assert.deepEqual(omitted, [{ key: 'ORG_LOGO', reason: 'not-https' }]);
});

test('an official email on another domain than the website is flagged', () => {
  assert.deepEqual(buildStellarToml(full).warnings, []);
  assert.deepEqual(buildStellarToml({ ...full, officialEmail: 'andes@gmail.com' }).warnings, ['email-other-domain']);
  assert.deepEqual(buildStellarToml({ ...full, website: 'http://andestech.com' }).warnings, ['website-not-https']);
});

test('a value cannot break out of its line or add a key of its own', () => {
  const { text } = buildStellarToml({ ...full, description: 'línea 1"\nORG_URL = "https://evil.example' });
  assert.equal(text.split('\n').filter((line) => line.startsWith('ORG_URL')).length, 1);
  assert.ok(text.includes('línea 1\\"\\nORG_URL'));
  assert.equal(tomlString('a\\b'), '"a\\\\b"');
  assert.equal(tomlString('tab\there'), '"tab\\there"');
  assert.equal(tomlString('bell\u0007'), '"bell\\u0007"');
});

test('the tax id and the address never reach the file', () => {
  const { text } = buildStellarToml({ ...full, taxId: '30-12345678-9', address: 'Calle 1' });
  assert.ok(!text.includes('30-12345678-9'));
  assert.ok(!text.includes('Calle 1'));
});
