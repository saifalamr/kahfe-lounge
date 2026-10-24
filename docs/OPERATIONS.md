# Kahfe POS: security and reliability rollout

## Release order

This is an upgrade for the existing multi-tenant database, not a fresh-database bootstrap. `supabase/schema.sql` is historical and must not be executed. Fixtures contain schema metadata and synthetic records only; they are not a production backup.

1. Apply `20261024005041_pos_security_reliability.sql` to the verified production Supabase project. It adds transactional RPCs, an audit log, a notification outbox and private encrypted backup support. Existing clients keep working.
2. Deploy this frontend and `pos-notifications` Edge Function. Keep Edge JWT verification enabled. Confirm QR ordering, options, limited-staff kitchen completion, full/partial/mixed/debt payments, void, refund, table transfer, closed-bill edits and image upload using a separate test restaurant. Existing staff sessions are mapped to staff IDs only when names are unambiguous.
3. Refresh all staff devices to the new client. Verify offline queues before refreshing or clearing browser data. Legacy queued orders require operator review; they are not replayed automatically.
4. Apply `20261024010336_pos_access_lockdown.sql` only after the compatible frontend is confirmed. It removes anonymous operational reads/writes, restricts image mutations, stores PINs using bcrypt and replaces PIN login/management functions atomically. Existing codes remain valid. Ambiguous old staff sessions must sign in again.
5. Check Supabase security/performance advisors, CI and deployment status. Do not roll the frontend back to the old direct-write client after lockdown. Prefer a forward fix. Never remove completed operation IDs while clients may still retry.

Generated migration files must match the `pos-*.sql` authoring files. Run `node scripts/build-migrations.mjs` after changes and `node scripts/build-migrations.mjs --check` in CI. Run `npm test`, `npx tsc --noEmit`, `npm run build` and `npm audit --omit=dev`.

## Credential incident and repository exposure

The old Telegram credential must be revoked through BotFather, including if it has already been removed from current source. Set the replacement as Supabase Edge secret `TELEGRAM_BOT_TOKEN`; never place it in a NEXT_PUBLIC variable, SQL migration, browser storage or commit. Keep recipients in manager-only settings. No replacement credential is embedded here.

Make the repository private to restrict access to historical business-data backups and the leaked credential in Git history. Removing a file from the latest commit does not remove historical copies, forks or caches. A history purge requires a separately coordinated rewrite, backup and collaborator reset; this release does not force-rewrite history.

The old `backups` branch remains an incident remediation item until repository access/history is addressed. The replacement workflow has read-only Git permissions and never commits business data.

## Backups and recovery

The scheduled workflow uses the existing GitHub secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It calls a service-role-only, transaction-consistent snapshot RPC, then encrypts database, image files and manifest with AES-256-GCM before upload to the private `pos-backups` bucket. It downloads and decrypts the persisted database file to check it. No plaintext backup is uploaded. Raw legacy PINs are redacted; after lockdown encrypted snapshots contain bcrypt hashes so codes can be restored.

A failed run must be investigated in Actions. A verified encrypted export is not a complete disaster recovery drill: record a successful restore into a separate disposable project before relying on this as the only backup. Images are copied after the database snapshot, so simultaneous image replacement may require retaining older image objects.

Export a recovery copy of `pos_backup_encryption_key` from Supabase Vault into the owner's secure password manager. Do not put it in this repository or logs. Losing both the project and this key makes encrypted backups unreadable. Keep a second encrypted backup outside the source project for project-deletion recovery. Provider-managed backups/PITR are separate and must be confirmed for the project's actual plan.

For recovery, use `scripts/backup-crypto.mjs`'s `decrypt` with the 32-byte base64-decoded recovery key. Download ciphertext with a service role on a trusted machine. Restore schema/migrations first in an isolated project, then business records in foreign-key dependency order, then images. Verify row counts, foreign keys, totals, invoice numbers and a sample of images. Do not import data into the active production database during a drill. Restore of pre-lockdown snapshots needs new PIN enrollment because original raw PINs were excluded.

## Operational behavior and limits

Prices, option choices, table validity and tracked inventory are validated on the server. Order/payment/adjustment request IDs make retries return the original result without repeating stock or ledger changes. A reused ID with a changed payload is rejected. Payments require connectivity and compare a current snapshot; preparation status is independent of payment status.

Limited staff can create orders, take ordinary payments and mark food served, but cannot apply discounts, debt, refunds, edits or menu changes. Full staff can make operational adjustments. Only managers can change the menu, settings and image files. Owner sessions are read-only. Audit rows record the trusted session identity and omit PIN/session-token fields.

Closed bills with discounts or refunds must be reopened/corrected through the dedicated flows; the direct bill editor rejects these to avoid double refunds. A cash adjustment cannot refund more than the original cash allocation. A reopen rejects already-refunded bills.

Notification delivery is secondary to a committed order. The outbox persists failed deliveries; a missing token does not roll an order back. Telegram delivery may be duplicated if a worker crashes after Telegram accepts a message but before the outbox is marked sent. Before enabling alerts, configure a retry worker/schedule and monitor unsent outbox entries; this release does not claim exactly-once Telegram delivery. Recipients must be explicitly configured; there is no hardcoded fallback.

Public QR links still identify the configured table by name and are protected by per-table submission limits. Signed/rotating QR tokens and a venue network policy are additional hardening options, especially where remote order abuse is a concern. Do not claim that an unsigned QR proves physical presence.

The large admin component remains a maintenance concern. This release extracts order/payment/export/escaping modules; a complete UI decomposition and end-to-end suite for every reporting screen are follow-up work. Financial reports, fiscal compliance, external payment gateways, offline card acquiring and hardware printer integration require separate validation; no certification is implied by these fixes.

## Rollback and approval boundary

Production migration application was blocked by automatic approval review. No migration or Edge deployment was applied in this repair session. Do not merge this branch into production until the owner approves the exact rollout.

Before phase 1, confirm a provider backup/recovery point and export the current function definitions/policies. Phase 1 is additive except for the hardened transfer function and the staff-ID backfill. If a new RPC fails, keep the old frontend active; disable its caller and restore the previous transfer-function definition if needed. Do not drop new tables, audit records, request IDs or notification rows as a rollback. These may contain completed operations once the new frontend is live.

Between frontend deployment and phase 2, the prior frontend deployment can still be restored because legacy permissions are still active. Verify the candidate deployment and all staff clients before contracting access. If a problem appears after phase 2, use a compatible frontend and a forward SQL fix. Reopening public financial-table access or reverting hashed PIN handling would undo the security fix and requires a separate owner decision. PIN hashes cannot be converted back into original codes, but the updated login validates the same codes.

Required owner approval covers the production Supabase migrations, compatible frontend release, Edge function deployment and the refresh of staff devices. Revoking/replacing the compromised Telegram token requires the owner through BotFather. Repository privacy cannot be changed through this GitHub connector and the browser is not signed in.
