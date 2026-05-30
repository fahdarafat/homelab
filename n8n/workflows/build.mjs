// Generates importable n8n workflow JSON for the SMS → Actual Budget pipeline.
// Run:  node n8n/workflows/build.mjs
// Output: n8n/workflows/sms-import.json, n8n/workflows/sms-confirm.json
// No secrets/real ids are embedded — everything resolves from n8n $env at runtime.
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const read = (f) => readFileSync(new URL(`./src/${f}`, here), 'utf8');
const buildOpenAiCode = read('build-openai-request.js');
const transformCode = read('transform-route.js');

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
  node('Build OpenAI Request', 'n8n-nodes-base.code', 2, [440, 300],
    { mode: 'runOnceForAllItems', jsCode: buildOpenAiCode }),
  node('OpenAI Parse', 'n8n-nodes-base.httpRequest', 4.2, [660, 300], {
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    sendHeaders: true,
    headerParameters: { parameters: [httpHeader('Authorization', '=Bearer {{$env.OPENAI_API_KEY}}')] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ $json.body }}',
    options: {},
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
    jsonBody: '={{ { topic: $env.NTFY_TOPIC, title: "SMS needs review: " + $json.reasons.join(", "), message: ($json.parsed.merchant || "?") + " — " + $json.parsed.currency + " " + $json.parsed.amount, actions: $json.txn ? [ { action: "http", label: "Approve", url: "http://n8n:5678/webhook/sms-confirm", method: "POST", headers: { "x-confirm-secret": $env.SMS_CONFIRM_SECRET }, body: JSON.stringify({ txn: $json.txn }), clear: true } ] : [] } }}',
    options: {},
  }),
];

const importConnections = {
  'SMS In': { main: [[{ node: 'Get Categories', type: 'main', index: 0 }]] },
  'Get Categories': { main: [[{ node: 'Build OpenAI Request', type: 'main', index: 0 }]] },
  'Build OpenAI Request': { main: [[{ node: 'OpenAI Parse', type: 'main', index: 0 }]] },
  'OpenAI Parse': { main: [[{ node: 'Transform & Route', type: 'main', index: 0 }]] },
  'Transform & Route': { main: [[{ node: 'Route', type: 'main', index: 0 }]] },
  'Route': { main: [
    [{ node: 'Import Transaction', type: 'main', index: 0 }],
    [{ node: 'Notify Review (ntfy)', type: 'main', index: 0 }],
  ] },
};

// ---------------- sms-confirm ----------------
const confirmNodes = [
  node('Confirm In', 'n8n-nodes-base.webhook', 2, [0, 300],
    { httpMethod: 'POST', path: 'sms-confirm', responseMode: 'onReceived', options: {} },
    { webhookId: 'sms-confirm-webhook' }),
  node('Check Secret', 'n8n-nodes-base.if', 2.2, [240, 300],
    { conditions: equalsRule('={{$json.headers["x-confirm-secret"]}}', '={{$env.SMS_CONFIRM_SECRET}}'), options: {} }),
  node('Import Confirmed', 'n8n-nodes-base.httpRequest', 4.2, [480, 200], {
    method: 'POST',
    url: '={{$env.ACTUAL_API_URL}}/budgets/{{$env.ACTUAL_BUDGET_SYNC_ID}}/accounts/{{$json.body.txn.account}}/transactions/import',
    sendHeaders: true,
    headerParameters: { parameters: [httpHeader('x-api-key', '={{$env.ACTUAL_API_KEY}}')] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ { transactions: [$json.body.txn], defaultCleared: false } }}',
    options: {},
  }),
];
const confirmConnections = {
  'Confirm In': { main: [[{ node: 'Check Secret', type: 'main', index: 0 }]] },
  'Check Secret': { main: [[{ node: 'Import Confirmed', type: 'main', index: 0 }], []] },
};

const wrap = (name, nodes, connections) => ({
  name, nodes, connections, active: false, settings: { executionOrder: 'v1' },
});

writeFileSync(new URL('./sms-import.json', here), JSON.stringify(wrap('sms-import', importNodes, importConnections), null, 2));
writeFileSync(new URL('./sms-confirm.json', here), JSON.stringify(wrap('sms-confirm', confirmNodes, confirmConnections), null, 2));
console.log('wrote sms-import.json and sms-confirm.json');
