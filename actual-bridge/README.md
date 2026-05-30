# actual-bridge

Pure, unit-tested transform helpers for the SMS → Actual Budget pipeline.

`lib/transform.mjs` is the **source of truth**. Its functions are pasted verbatim
into the n8n **"Transform & Route"** Code node (see `n8n/workflows/sms-import.json`).
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
