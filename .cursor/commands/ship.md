# ship

Publish current changes.

1. `git fetch origin`; read `src/app/app.constants.ts` from origin/main, HEAD, and working tree; take the highest version.
2. Propose bump (minor for feature, patch for fix/style/refactor; major stays 4) and message `Ver4.X.X-<description>`. Wait for user confirmation (reply in Traditional Chinese).
3. Bump `APP_CONFIG` once, commit, push immediately.
4. Do not touch `tyapp_app_log` or Supabase.
