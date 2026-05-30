# End-to-end checks (post sanitized samples to the live webhook)

Tailscale connected. Replace <tailnet>. Each asserts the routing from the spec's test table.
NOTE: these create REAL transactions in your budget — delete the test ones in Actual
afterwards (or run against a throwaway test budget/Sync ID).

# 1. Bank A EGP purchase -> auto-import
curl -sX POST https://n8n.<tailnet>/webhook/sms -H 'Content-Type: application/json' \
  -d '{"raw_text":"Your Credit Card ending with * 1234 has been used for EGP 1339.50 on 27/05/2026 at WE-FBB-Pre. Your available limit is EGP 100.00","received_at":"2026-05-27T00:00:00Z"}'
# Expect: appears in Actual (Bank A account), amount -133950, category set.

# 2. Bank A USD purchase -> converted import
curl -sX POST .../webhook/sms -d '{"raw_text":"Your Credit Card ending with * 1234 has been used for USD 5.70 on 29/05/2026 at OPENAI. Your available limit is EGP 200.00","received_at":"..."}'
# Expect: amount ≈ -(5.70*rate*1.03)*100, note has "orig USD 5.70".

# 3. Bank B Arabic transfer -> auto-import, imported_id = ref:TXN0001
# 4. Bank B Arabic debit -> auto-import
# 5. OTP -> ntfy review, no transaction
# 6. Resend #1 -> deduped, no second transaction
