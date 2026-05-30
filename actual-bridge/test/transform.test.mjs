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

import { toMinorUnits, convertToEgp } from '../lib/transform.mjs';

test('toMinorUnits converts EGP major to integer minor units', () => {
  assert.equal(toMinorUnits(390.00), 39000);
  assert.equal(toMinorUnits(1339.5), 133950);
  assert.equal(toMinorUnits(0.1 + 0.2), 30); // float-safety: 0.30 -> 30
});
test('convertToEgp applies rate and markup, returns EGP minor units', () => {
  // 5.70 USD * 50 EGP/USD * 1.03 markup = 293.55 EGP -> 29355 minor
  assert.equal(convertToEgp(5.70, 50, 0.03), 29355);
});
test('convertToEgp with zero markup', () => {
  assert.equal(convertToEgp(10, 50, 0), 50000);
});

import { buildImportedId } from '../lib/transform.mjs';

test('buildImportedId uses the bank reference when present', () => {
  assert.equal(buildImportedId('TXN0001', 'whatever'), 'ref:TXN0001');
});
test('buildImportedId hashes raw text when no reference', () => {
  const a = buildImportedId(null, 'some sms text');
  const b = buildImportedId('', 'some sms text');
  assert.equal(a, b);
  assert.match(a, /^sms:[0-9a-f]{16}$/);
});
test('buildImportedId is stable and collision-resistant per text', () => {
  assert.notEqual(buildImportedId(null, 'text A'), buildImportedId(null, 'text B'));
});

import { mapLast4ToAccount } from '../lib/transform.mjs';

const MAP = { '1234': 'acc-hsbc', '5678': 'acc-cib', '9012': 'acc-cib-debit' };

test('mapLast4ToAccount resolves a known last-4', () => {
  assert.equal(mapLast4ToAccount('1234', MAP), 'acc-hsbc');
});
test('mapLast4ToAccount tolerates numeric input', () => {
  assert.equal(mapLast4ToAccount(5678, MAP), 'acc-cib');
});
test('mapLast4ToAccount returns null for unknown', () => {
  assert.equal(mapLast4ToAccount('0000', MAP), null);
  assert.equal(mapLast4ToAccount(null, MAP), null);
});

import { mapCategory } from '../lib/transform.mjs';

const CATS = [{ id: 'c1', name: 'Groceries' }, { id: 'c2', name: 'Dining Out' }];

test('mapCategory matches case-insensitively', () => {
  assert.equal(mapCategory('groceries', CATS), 'c1');
  assert.equal(mapCategory('Dining Out', CATS), 'c2');
});
test('mapCategory returns null for blank or unknown', () => {
  assert.equal(mapCategory('', CATS), null);
  assert.equal(mapCategory(null, CATS), null);
  assert.equal(mapCategory('Nonexistent', CATS), null);
});
