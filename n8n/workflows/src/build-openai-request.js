// n8n Code node "Build OpenAI Request" — Run Once for All Items.
// Builds the chat-completions request body (avoids fragile inline expressions).
const rawText = $('SMS In').first().json.body.raw_text;
const names = ($('Get Categories').first().json.data || []).map((c) => c.name).join(', ');
const system = [
  'You extract structured data from a single bank transaction SMS (English or Arabic).',
  'Return ONLY a JSON object with these keys:',
  '- msg_type: one of "purchase","transfer","refund","credit","otp","marketing","unknown"',
  '- direction: "debit" or "credit"',
  '- amount: number (transaction amount in original currency, no thousands separators)',
  '- currency: ISO code, e.g. "EGP" or "USD"',
  '- date: YYYY-MM-DD (dates in the SMS are day-first, DD/MM or DD-MM)',
  '- last4: the last 4 digits as a string, or "" if absent',
  '- merchant: merchant/payee name, or "" (for transfers use "Transfer")',
  '- bank_ref: bank reference id if present, else ""',
  '- bank: "Bank A", "Bank B", or "" if unknown',
  '- category: single best match from [' + names + '] or "" if unsure (do not invent categories)',
  '- confidence: number 0..1',
  'Output JSON only, no prose.',
].join('\n');

return [{ json: { body: {
  model: 'gpt-4o-mini',
  temperature: 0,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: rawText },
  ],
} } }];
