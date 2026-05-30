// n8n Code node "Transform & Route" — Run Once for All Items.
// Adapted from actual-bridge/lib/transform.mjs (export stripped; require('crypto')).
const { createHash } = require('crypto');
const BASE_CURRENCY = 'EGP';
const IMPORTABLE_TYPES = new Set(['purchase', 'transfer']);

function validateIsoDate(date) {
  if (typeof date !== 'string') return false;
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === date;
}
function toMinorUnits(a) { return Math.round(Number(a) * 100); }
function convertToEgp(a, rate, markup) { return Math.round(Number(a) * Number(rate) * (1 + Number(markup)) * 100); }
function buildImportedId(bankRef, rawText) {
  if (bankRef && String(bankRef).trim() !== '') return `ref:${String(bankRef).trim()}`;
  return `sms:${createHash('sha256').update(String(rawText)).digest('hex').slice(0, 16)}`;
}
function mapLast4ToAccount(last4, map) {
  if (last4 === null || last4 === undefined) return null;
  const k = String(last4).trim();
  return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
}
function mapCategory(name, cats) {
  if (!name || String(name).trim() === '') return null;
  const t = String(name).trim().toLowerCase();
  const hit = cats.find((c) => String(c.name).trim().toLowerCase() === t);
  return hit ? hit.id : null;
}
function validateParseResult(p) {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'not_object' };
  for (const f of ['msg_type', 'direction', 'currency', 'date']) {
    if (typeof p[f] !== 'string' || p[f].trim() === '') return { ok: false, reason: `missing_${f}` };
  }
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount)) return { ok: false, reason: 'bad_amount' };
  if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) return { ok: false, reason: 'bad_confidence' };
  if (!validateIsoDate(p.date)) return { ok: false, reason: 'bad_date' };
  return { ok: true };
}
function decideRoute(p, ctx) {
  const valid = validateParseResult(p);
  if (!valid.ok) return { action: 'review', reasons: ['parse_failed', valid.reason] };
  const reasons = [];
  if (!IMPORTABLE_TYPES.has(p.msg_type)) reasons.push('unknown_msg_type');
  if (!ctx.accountId) reasons.push('unknown_last4');
  if (p.confidence < ctx.threshold) reasons.push('low_confidence');
  if (p.currency !== BASE_CURRENCY && (ctx.rate === null || ctx.rate === undefined)) reasons.push('fx_failed');
  return { action: reasons.length === 0 ? 'import' : 'review', reasons };
}
function buildActualTransaction(p, ctx) {
  if (!ctx.accountId) return null;
  if (!validateParseResult(p).ok) return null;
  const isForeign = p.currency !== BASE_CURRENCY;
  if (isForeign && (ctx.rate === null || ctx.rate === undefined)) return null;
  const minor = isForeign ? convertToEgp(p.amount, ctx.rate, ctx.markup) : toMinorUnits(p.amount);
  const amount = minor === 0 ? 0 : -Math.abs(minor);
  // Bank name intentionally omitted: SMS rarely names the bank (LLM would guess wrong);
  // the destination Actual account already identifies it.
  const parts = ['via SMS', p.last4 ? `card *${p.last4}` : null].filter((x) => x && String(x).trim() !== '');
  let notes = parts.join(' · ');
  if (isForeign) notes += ` · orig ${p.currency} ${Number(p.amount).toFixed(2)} @ ${Number(ctx.rate)}×${(1 + Number(ctx.markup)).toFixed(4)}`;
  return {
    account: ctx.accountId,
    date: p.date,
    amount,
    payee_name: p.merchant || 'Unknown',
    imported_payee: p.merchant || '',
    category: mapCategory(p.category, ctx.categories),
    notes,
    imported_id: buildImportedId(p.bank_ref, ctx.rawText),
    cleared: false,
  };
}

// ----- orchestration -----
const cfg = {
  accountMap: JSON.parse($env.SMS_ACCOUNT_MAP),
  threshold: Number($env.SMS_CONF_THRESHOLD),
  markup: Number($env.SMS_FX_MARKUP),
};
const rawText = $('SMS In').first().json.body.raw_text;
const categories = $('Get Categories').first().json.data;

let parsed;
try { parsed = JSON.parse($('OpenAI Parse').first().json.choices[0].message.content); }
catch (e) { parsed = null; }

let rate = null;
if (parsed && parsed.currency && parsed.currency !== BASE_CURRENCY) {
  try {
    const r = await this.helpers.httpRequest({ method: 'GET', url: `https://open.er-api.com/v6/latest/${parsed.currency}`, json: true });
    rate = (r && r.rates && typeof r.rates.EGP === 'number') ? r.rates.EGP : null;
  } catch (e) { rate = null; }
}

const accountId = parsed ? mapLast4ToAccount(parsed.last4, cfg.accountMap) : null;
const safeParsed = parsed || { msg_type: 'unknown', confidence: 0, currency: '', date: '', direction: '', amount: NaN };
const route = decideRoute(safeParsed, { accountId, rate, threshold: cfg.threshold });
const txn = parsed ? buildActualTransaction(parsed, { accountId, rate, markup: cfg.markup, categories, rawText }) : null;

return [{ json: { action: route.action, reasons: route.reasons, txn, parsed: safeParsed, accountId, rate } }];
