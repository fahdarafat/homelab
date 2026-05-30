import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner works', () => {
  assert.equal(1 + 1, 2);
});

import { validateIsoDate } from '../lib/transform.mjs';

test('validateIsoDate accepts a real ISO date', () => {
  assert.equal(validateIsoDate('2026-05-29'), true);
});
test('validateIsoDate rejects DD/MM/YYYY', () => {
  assert.equal(validateIsoDate('29/05/2026'), false);
});
test('validateIsoDate rejects impossible dates', () => {
  assert.equal(validateIsoDate('2026-13-40'), false);
});
test('validateIsoDate rejects empty/garbage', () => {
  assert.equal(validateIsoDate(''), false);
  assert.equal(validateIsoDate(null), false);
});
