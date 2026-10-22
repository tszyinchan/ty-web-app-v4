# verify

This command **is** user confirmation. Run browser verification now per `.cursor/rules/verify-before-done.mdc` and `.cursor/rules/browser-must-be-visible.mdc`. Do not ask again whether to test.

1. Confirm the user has `ng serve` running in a visible terminal; do not start it yourself.
2. Browser tab must be visible. Log in per the rule (test credentials file or ask user).
3. Cover main path, empty/error/edge states, and shared-state screens.
4. Mark Super Admin-only cases `Needs Super Admin` with one line of what to click; never Pass them.
5. Reply with the 驗證報告 table (Traditional Chinese).
