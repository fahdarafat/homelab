# actual-bridge

Pure, unit-tested transform helpers for the SMS → Actual Budget pipeline.

`lib/transform.mjs` is the **source of truth**. Its functions are **adapted**
into the n8n **"Transform & Route"** Code node (see `n8n/workflows/sms-import.json`).
The Code node runs CommonJS in a sandbox, so the ESM `import`/`export` syntax
used here is invalid there. When pasting, make these mechanical edits:

1. Remove the `export` keyword from each `function`.
2. Replace `import { createHash } from 'node:crypto'` with
   `const { createHash } = require('crypto')`.

When you change a function here, re-run `node --test` and update the Code node.

## Functions
- `buildParsePrompt(rawText, categoryNames)` → OpenAI `messages`
- `validateParseResult(parsed)` → `{ ok, reason }`
- `validateIsoDate(date)`, `toMinorUnits(amount)`, `convertToEgp(amount, rate, markup)`
- `mapLast4ToAccount(last4, accountMap)`, `mapCategory(name, categories)`
- `buildImportedId(bankRef, rawText)`
- `decideRoute(parsed, ctx)` → `{ action: 'import'|'review', reasons }`
- `buildActualTransaction(parsed, ctx)` → Actual txn object or `null`

## Test
```bash
cd actual-bridge && node --test
```
