// Pure transform helpers for the SMS → Actual Budget pipeline.
// This file is the source of truth; its contents are pasted into the n8n
// "Transform & Route" Code node (see actual-bridge/README.md).
import { createHash } from 'node:crypto';

export function validateIsoDate(date) {
  if (typeof date !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Reject values that JS "rolls over" (e.g. 2026-13-40 -> next year).
  return d.toISOString().slice(0, 10) === date;
}

export function toMinorUnits(amount) {
  // Round to cents first to avoid float artifacts (e.g. 0.30000000000000004).
  return Math.round(Number(amount) * 100);
}

export function convertToEgp(amount, rate, markup) {
  const egpMajor = Number(amount) * Number(rate) * (1 + Number(markup));
  return Math.round(egpMajor * 100);
}

export function buildImportedId(bankRef, rawText) {
  if (bankRef && String(bankRef).trim() !== '') {
    return `ref:${String(bankRef).trim()}`;
  }
  const hash = createHash('sha256').update(String(rawText)).digest('hex').slice(0, 16);
  return `sms:${hash}`;
}

export function mapLast4ToAccount(last4, accountMap) {
  if (last4 === null || last4 === undefined) return null;
  const key = String(last4).trim();
  return Object.prototype.hasOwnProperty.call(accountMap, key) ? accountMap[key] : null;
}

export function mapCategory(name, categories) {
  if (!name || String(name).trim() === '') return null;
  const target = String(name).trim().toLowerCase();
  const hit = categories.find((c) => String(c.name).trim().toLowerCase() === target);
  return hit ? hit.id : null;
}

export function validateParseResult(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not_object' };
  const reqStr = ['msg_type', 'direction', 'currency', 'date'];
  for (const f of reqStr) {
    if (typeof parsed[f] !== 'string' || parsed[f].trim() === '') {
      return { ok: false, reason: `missing_${f}` };
    }
  }
  if (typeof parsed.amount !== 'number' || !Number.isFinite(parsed.amount)) {
    return { ok: false, reason: 'bad_amount' };
  }
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    return { ok: false, reason: 'bad_confidence' };
  }
  if (!validateIsoDate(parsed.date)) return { ok: false, reason: 'bad_date' };
  return { ok: true };
}

const IMPORTABLE_TYPES = new Set(['purchase', 'transfer']);

export function decideRoute(parsed, ctx) {
  const reasons = [];
  const valid = validateParseResult(parsed);
  if (!valid.ok) {
    return { action: 'review', reasons: ['parse_failed', valid.reason] };
  }
  if (!IMPORTABLE_TYPES.has(parsed.msg_type)) reasons.push('unknown_msg_type');
  if (!ctx.accountId) reasons.push('unknown_last4');
  if (parsed.confidence < ctx.threshold) reasons.push('low_confidence');
  if (parsed.currency !== 'EGP' && (ctx.rate === null || ctx.rate === undefined)) {
    reasons.push('fx_failed');
  }
  return { action: reasons.length === 0 ? 'import' : 'review', reasons };
}
