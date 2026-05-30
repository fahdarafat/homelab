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
