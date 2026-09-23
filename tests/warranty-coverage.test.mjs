import assert from 'node:assert/strict';
import { test } from 'node:test';
import { warrantyCoverage } from '../src/lib/warranty-coverage.ts';

const start = '2026-01-01T00:00:00.000Z';
const end = '2026-01-11T00:00:00.000Z';

test('remaining coverage uses the original activation interval, including partial days', () => {
  const result = warrantyCoverage(start, end, Date.parse('2026-01-06T12:00:00.000Z'));
  assert.deepEqual(result, { state: 'active', totalDays: 10, remainingDays: 5, percent: 45 });
});

test('expiry reaches zero exactly at the deadline and stays clamped afterwards', () => {
  for (const now of [Date.parse(end), Date.parse(end) + 86400000]) {
    assert.deepEqual(warrantyCoverage(start, end, now), { state: 'expired', totalDays: 10, remainingDays: 0, percent: 0 });
  }
  assert.equal(warrantyCoverage(start, end, Date.parse(end) - 1).remainingDays, 1);
});

test('future coverage does not exceed 100% or claim to be active', () => {
  assert.deepEqual(warrantyCoverage(start, end, Date.parse(start) - 1), { state: 'pending', totalDays: 10, remainingDays: 10, percent: 100 });
  assert.equal(warrantyCoverage(start, end, Date.parse(start)).state, 'active');
});

test('missing, invalid, empty and reversed ranges do not invent a coverage duration', () => {
  for (const [from, until] of [[null, end], [start, null], ['', end], ['invalid', end], [end, start], [start, start]]) {
    assert.equal(warrantyCoverage(from, until, Date.now()), null);
  }
  assert.equal(warrantyCoverage(start, end, NaN), null);
});

test('offset dates measure elapsed time independently of locale and daylight saving', () => {
  assert.deepEqual(warrantyCoverage('2026-03-08T00:00:00-05:00', '2026-03-09T00:00:00-04:00', Date.parse('2026-03-08T16:30:00Z')),
    { state: 'active', totalDays: 1, remainingDays: 1, percent: 50 });
});
