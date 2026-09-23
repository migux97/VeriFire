// The only request body with branching validation: what a company may configure for the labels of a batch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIssuanceOptions } from '../src/lib/issuance.ts';

test('a complete configuration is trimmed and kept', () => {
  assert.deepEqual(parseIssuanceOptions({ brand: '  Andes  ', labelText: ' Original ', labelStyle: 'compact' }),
    { brand: 'Andes', labelText: 'Original', labelStyle: 'compact' });
});

test('no configuration at all is valid: the batch uses the defaults', () => {
  assert.equal(parseIssuanceOptions(undefined), undefined);
});

test('anything that is not an object is rejected', () => {
  for (const value of [null, 'texto', 7, [], [{ brand: 'x' }]]) {
    assert.throws(() => parseIssuanceOptions(value), /Configuración de emisión inválida/);
  }
});

test('the label style is one of the two the printer knows', () => {
  for (const labelStyle of ['grande', '', undefined, 'STANDARD']) {
    assert.throws(() => parseIssuanceOptions({ brand: 'a', labelText: 'b', labelStyle }), /Formato de etiqueta inválido/);
  }
});

test('text longer than the label holds, or not text at all, is rejected', () => {
  assert.throws(() => parseIssuanceOptions({ brand: 'x'.repeat(81), labelText: 'b', labelStyle: 'standard' }), /Campo brand/);
  assert.throws(() => parseIssuanceOptions({ brand: 'a', labelText: 'x'.repeat(161), labelStyle: 'standard' }), /Campo labelText/);
  assert.throws(() => parseIssuanceOptions({ brand: 5, labelText: 'b', labelStyle: 'standard' }), /Campo brand/);
  assert.deepEqual(parseIssuanceOptions({ brand: 'x'.repeat(80), labelText: '', labelStyle: 'standard' }),
    { brand: 'x'.repeat(80), labelText: '', labelStyle: 'standard' });
});
