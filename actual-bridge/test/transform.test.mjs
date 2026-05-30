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

import { validateParseResult } from '../lib/transform.mjs';

const GOOD = {
  msg_type: 'purchase', direction: 'debit', amount: 390, currency: 'EGP',
  date: '2026-05-27', last4: '9012', merchant: 'Talabat', category: 'Dining Out', confidence: 0.95,
};

test('validateParseResult accepts a well-formed object', () => {
  assert.equal(validateParseResult(GOOD).ok, true);
});
test('validateParseResult rejects missing required fields', () => {
  const bad = { ...GOOD }; delete bad.amount;
  assert.equal(validateParseResult(bad).ok, false);
});
test('validateParseResult rejects non-numeric amount/confidence', () => {
  assert.equal(validateParseResult({ ...GOOD, amount: 'x' }).ok, false);
  assert.equal(validateParseResult({ ...GOOD, confidence: 'high' }).ok, false);
});
test('validateParseResult rejects bad date', () => {
  assert.equal(validateParseResult({ ...GOOD, date: '27/05/2026' }).ok, false);
});

import { decideRoute } from '../lib/transform.mjs';

const base = {
  msg_type: 'purchase', direction: 'debit', amount: 390, currency: 'EGP',
  date: '2026-05-27', last4: '9012', merchant: 'Talabat', category: 'Dining Out', confidence: 0.95,
};
const ctx = { accountId: 'acc-cib-debit', rate: null, threshold: 0.8 };

test('clean EGP purchase auto-imports', () => {
  assert.equal(decideRoute(base, ctx).action, 'import');
});
test('low confidence -> review', () => {
  const r = decideRoute({ ...base, confidence: 0.5 }, ctx);
  assert.equal(r.action, 'review');
  assert.ok(r.reasons.includes('low_confidence'));
});
test('unknown last4 (no accountId) -> review', () => {
  const r = decideRoute(base, { ...ctx, accountId: null });
  assert.equal(r.action, 'review');
  assert.ok(r.reasons.includes('unknown_last4'));
});
test('unknown msg_type -> review', () => {
  const r = decideRoute({ ...base, msg_type: 'refund' }, ctx);
  assert.equal(r.action, 'review');
  assert.ok(r.reasons.includes('unknown_msg_type'));
});
test('foreign currency WITH rate auto-imports', () => {
  const r = decideRoute({ ...base, currency: 'USD' }, { ...ctx, rate: 50 });
  assert.equal(r.action, 'import');
});
test('foreign currency WITHOUT rate -> review', () => {
  const r = decideRoute({ ...base, currency: 'USD' }, { ...ctx, rate: null });
  assert.equal(r.action, 'review');
  assert.ok(r.reasons.includes('fx_failed'));
});
test('parse-invalid input -> review with parse_failed', () => {
  const r = decideRoute({ ...base, amount: 'x' }, ctx);
  assert.equal(r.action, 'review');
  assert.ok(r.reasons.includes('parse_failed'));
});

import { buildActualTransaction } from '../lib/transform.mjs';

const CATS2 = [{ id: 'c2', name: 'Dining Out' }];
const egp = {
  msg_type: 'purchase', direction: 'debit', amount: 390, currency: 'EGP',
  date: '2026-05-27', last4: '9012', merchant: 'Talabat', category: 'Dining Out',
  confidence: 0.95, bank: 'Bank B', bank_ref: null,
};

test('builds an EGP debit transaction with negative amount', () => {
  const t = buildActualTransaction(egp, { accountId: 'acc', rate: null, markup: 0.03, categories: CATS2, rawText: 'raw' });
  assert.equal(t.account, 'acc');
  assert.equal(t.amount, -39000);
  assert.equal(t.date, '2026-05-27');
  assert.equal(t.payee_name, 'Talabat');
  assert.equal(t.category, 'c2');
  assert.equal(t.cleared, false);
  assert.match(t.imported_id, /^sms:/);
  assert.match(t.notes, /via SMS · Bank B · card \*9012/);
});
test('converts foreign currency and notes the original', () => {
  const usd = { ...egp, currency: 'USD', amount: 5.70, merchant: 'OPENAI', last4: '1234', bank: 'Bank A', category: '' };
  const t = buildActualTransaction(usd, { accountId: 'acc', rate: 50, markup: 0.03, categories: CATS2, rawText: 'raw' });
  assert.equal(t.amount, -29355);
  assert.equal(t.category, null);
  assert.match(t.notes, /orig USD 5.70 @ 50/);
});
test('uses bank_ref for imported_id when present', () => {
  const t = buildActualTransaction({ ...egp, bank_ref: 'TXN0001' }, { accountId: 'acc', rate: null, markup: 0.03, categories: CATS2, rawText: 'raw' });
  assert.equal(t.imported_id, 'ref:TXN0001');
});
test('returns null when foreign currency has no rate', () => {
  const usd = { ...egp, currency: 'USD' };
  const t = buildActualTransaction(usd, { accountId: 'acc', rate: null, markup: 0.03, categories: CATS2, rawText: 'raw' });
  assert.equal(t, null);
});
test('returns null when no accountId', () => {
  assert.equal(buildActualTransaction(egp, { accountId: null, rate: null, markup: 0.03, categories: CATS2, rawText: 'raw' }), null);
});
