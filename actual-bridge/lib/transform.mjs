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
