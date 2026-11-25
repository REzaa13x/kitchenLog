# Geasteats staff integration

Deployment gates (operator only; no automatic schema migration):
1. Back up DapurOps database. Confirm existing fixed Admin ID `u_supervisor_75d4f29fee493805`, email `admin@gmail.com`, target workspace `ws-u_mwsxhkk6b2fea13f`.
2. Apply `database/migrations/20261125-geasteats.sql` once, before starting new backend: nullable unique, binary external ID; widen users.phone to 50. Existing IDs, passwords, operational data remain unchanged. Do not import the destructive full schema into production.
3. Geasteats endpoints must be live: GET `/api/integrations/dapurops/staff` returns `{staff:[{id,name,email,role,status,phone}]}`; POST `/api/integrations/dapurops/login` accepts `{email,password}`, returns `{staff:{...}}`. Active status is exactly `active`; invalid credentials 401/404. Both require server-side `x-api-key`.
4. Set backend process variables `DAPUROPS_INTEGRATION_KEY` (same private key upstream), `GEASTEATS_URL` (default https://geasteats.ngolab.online), `GEASTEATS_WORKSPACE_ID` (default above). Never VITE_ or browser config. HTTP allowed only localhost for tests. Restart backend through normal deployment procedure.
5. Existing Admin uses Tim & Hak Akses → `Sinkronkan Staf Geasteats` (POST `/api/integrations/geasteats/sync`). Verify imported accounts, login, attendance/history intact. `skipped` means email belongs to an unlinked local account: that person must successfully authenticate upstream to link safely. No bulk email claiming.

Identity: immutable external ID, not email. Successful upstream login may link normalized legacy email, preserving user/staff IDs and history, revoking old sessions. Roster creates random unusable local hashes only for new emails. Linked accounts cannot reset/delete/edit locally; Geasteats owns name/email/phone/login. Operational job title remains local stored data, read-only through imported team form. Upstream roles never grant Admin: exact fixed ID plus admin@gmail.com only.

Legacy: unlinked accounts still verify local passwords when upstream rejects 401/404 or is unavailable; usernames remain supported. Linked accounts never fall back, including missing key/outage. Linked sessions require active upstream staff, cached at most 30s, unavailable upstream returns 503 after cache expiry; inactive/missing staff deletes sessions. Manual sync refreshes cache and revokes inactive sessions. No periodic roster import, no hard deletion.

Verification: `node scripts/geasteats-test.mjs` (isolated real MySQL database, mock HTTP upstream, 30s TTL exercise), `node scripts/backend-auth-test.mjs`, `npm run build`. Optional TEST_MYSQL_URL controls test MySQL connection only; tests create/drop random test databases, never the production database. No real credentials required.

Rollback: revert application only; additive column/phone widening can remain. Do not unlink IDs or restore local hashes as an outage workaround: that bypasses Geasteats access controls.
