// Generates importable n8n workflow JSON for the SMS → Actual Budget pipeline.
// Run:  node n8n/workflows/build.mjs
// Output: n8n/workflows/sms-import.json
// No secrets/real ids are embedded — everything resolves from n8n $env at runtime.
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const read = (f) => readFileSync(new URL(`./src/${f}`, here), 'utf8');
const transformCode = read('transform-route.js');

// JSON Schema for the Information Extractor output. `category` is a free string
// (the live list is dynamic, injected into the system prompt below) — the
// Transform & Route node maps it to a category id via case-insensitive match.
const parseSchema = {
  type: 'object',
  properties: {
    msg_type: { type: 'string', enum: ['purchase', 'transfer', 'refund', 'credit', 'otp', 'marketing', 'unknown'] },
    direction: { type: 'string', enum: ['debit', 'credit'] },
    amount: { type: 'number' },
    currency: { type: 'string' },
    date: { type: 'string', description: 'transaction date as YYYY-MM-DD; SMS dates are day-first' },
    last4: { type: 'string' },
    merchant: { type: 'string' },
    bank_ref: { type: 'string' },
    bank: { type: 'string' },
    category: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['msg_type', 'direction', 'amount', 'currency', 'date', 'confidence'],
};

const systemPromptTemplate =
  '=You extract structured data from a single bank transaction SMS (English or Arabic). '
  + 'Amounts have no thousands separators. Dates in the SMS are day-first (DD/MM) — output date as YYYY-MM-DD. '
  + 'For transfers set merchant to "Transfer". '
  + 'For category pick the single best match from this list or "" if unsure (never invent one): '
  + '{{ ($(\'Get Categories\').first().json.data || []).map(c => c.name).join(\', \') }}';

const httpHeader = (name, value) => ({ name, value });

function node(name, type, typeVersion, position, parameters, extra = {}) {
  return { parameters, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type, typeVersion, position, ...extra };
}

const equalsRule = (left, right) => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
  conditions: [{
    id: 'cond-1',
    leftValue: left,
    rightValue: right,
    operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
  }],
  combinator: 'and',
});

// ---------------- sms-import ----------------
const importNodes = [
  node('SMS In', 'n8n-nodes-base.webhook', 2, [0, 300],
    { httpMethod: 'POST', path: 'sms', responseMode: 'onReceived', options: {} },
    { webhookId: 'sms-in-webhook' }),
  node('Get Categories', 'n8n-nodes-base.httpRequest', 4.2, [220, 300], {
    method: 'GET',
    url: '={{$env.ACTUAL_API_URL}}/budgets/{{$env.ACTUAL_BUDGET_SYNC_ID}}/categories',
    sendHeaders: true,
    headerParameters: { parameters: [httpHeader('x-api-key', '={{$env.ACTUAL_API_KEY}}')] },
    options: {},
  }),
  // Native AI parsing: the Chat Model feeds the Information Extractor via an
  // ai_languageModel connection (see importConnections). The extractor returns
  // structured JSON at $json.output — no manual parsing.
  node('OpenAI Chat Model', '@n8n/n8n-nodes-langchain.lmChatOpenAi', 1.2, [560, 480],
    { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' }, options: {} }),
  node('Information Extractor', '@n8n/n8n-nodes-langchain.informationExtractor', 1.1, [660, 300], {
    text: "={{ $('SMS In').first().json.body.raw_text }}",
    schemaType: 'manual',
    inputSchema: JSON.stringify(parseSchema, null, 2),
    options: { systemPromptTemplate },
  }),
  node('Transform & Route', 'n8n-nodes-base.code', 2, [880, 300],
    { mode: 'runOnceForAllItems', jsCode: transformCode }),
  node('Route', 'n8n-nodes-base.if', 2.2, [1100, 300],
    { conditions: equalsRule('={{$json.action}}', 'import'), options: {} }),
  node('Import Transaction', 'n8n-nodes-base.httpRequest', 4.2, [1320, 200], {
    method: 'POST',
    url: '={{$env.ACTUAL_API_URL}}/budgets/{{$env.ACTUAL_BUDGET_SYNC_ID}}/accounts/{{$json.txn.account}}/transactions/import',
    sendHeaders: true,
    headerParameters: { parameters: [httpHeader('x-api-key', '={{$env.ACTUAL_API_KEY}}')] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ { transactions: [$json.txn], defaultCleared: false } }}',
    options: {},
  }),
  node('Notify Review (ntfy)', 'n8n-nodes-base.httpRequest', 4.2, [1320, 420], {
    method: 'POST',
    url: '={{$env.NTFY_URL}}',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ { topic: $env.NTFY_TOPIC, title: "SMS needs review: " + $json.reasons.join(", "), message: ($json.parsed.merchant || "Unknown") + " — " + $json.parsed.currency + " " + $json.parsed.amount } }}',
    options: {},
  }),
];

const importConnections = {
  'SMS In': { main: [[{ node: 'Get Categories', type: 'main', index: 0 }]] },
  'Get Categories': { main: [[{ node: 'Information Extractor', type: 'main', index: 0 }]] },
  'OpenAI Chat Model': { ai_languageModel: [[{ node: 'Information Extractor', type: 'ai_languageModel', index: 0 }]] },
  'Information Extractor': { main: [[{ node: 'Transform & Route', type: 'main', index: 0 }]] },
  'Transform & Route': { main: [[{ node: 'Route', type: 'main', index: 0 }]] },
  'Route': { main: [
    [{ node: 'Import Transaction', type: 'main', index: 0 }],
    [{ node: 'Notify Review (ntfy)', type: 'main', index: 0 }],
  ] },
};

const wrap = (name, nodes, connections) => ({
  name, nodes, connections, active: false, settings: { executionOrder: 'v1' },
});

writeFileSync(new URL('./sms-import.json', here), JSON.stringify(wrap('sms-import', importNodes, importConnections), null, 2));
console.log('wrote sms-import.json');
