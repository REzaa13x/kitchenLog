# KitchenLog Security Specification (Production RBAC)

## 1. Data Invariants
1. **PII Isolation**: `/users/{userId}` stores authenticated user email and profile metadata and is strictly readable/writable only by `request.auth.uid == userId` (or verified bootstrapped admin).
2. **Verified Multi-Employee Workspace Membership**: Every operational workspace (`/workspaces/{workspaceId}`) explicitly enumerates bounded `memberEmails` (max 25) and `supervisorEmails` (max 10). All reads/writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Role-Based Access Control (RBAC)**:
   - Only `isWorkspaceSupervisor(workspaceId)` (workspace owner or email listed in `supervisorEmails`) can manage `/staff`, `/assignments`, confirm `Izin`/`Sakit`/`Alpa`, or update `itemReports` resolution status.
   - Regular `staff` can only record check-in/check-out for their own verified email (`staffEmail == request.auth.token.email`), create `itemReports` under their own `reporterEmail`, or submit/update cleanliness reports if they are the assigned PIC (`picEmail == request.auth.token.email`).
4. **No `get()` in `allow list` (Query Enforcer)**: Every `allow list` rule evaluates `resource.data.ownerId == request.auth.uid` or `request.auth.token.email in resource.data.memberEmails` directly against `resource.data`.
5. **Cross-Device Synced Photos**: `/workspaces/{workspaceId}/photos/{photoId}` restricts `dataUrl` to `<= 450,000` characters and `uploaderEmail == request.auth.token.email`, readable only by workspace members.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated read on `/workspaces/kitchen-utama/itemReports`**: `request.auth == null` -> DENIED.
2. **Unverified email write**: `request.auth.token.email_verified == false` -> DENIED.
3. **Uninvited user listing `/workspaces/kitchen-utama/attendance`**: email not in `resource.data.memberEmails` -> DENIED.
4. **Staff attempting to add a new staff member or promote self to supervisor**: non-supervisor writing `/workspaces/{id}/staff/{staffId}` -> DENIED.
5. **Staff attempting to modify shift schedule or appoint PIC**: non-supervisor writing `/workspaces/{id}/assignments/{id}` -> DENIED.
6. **Staff spoofing check-in for another employee**: `staffEmail != request.auth.token.email` -> DENIED.
7. **Staff setting `supervisorStatus: 'Izin'` on own check-in/update**: non-supervisor setting `supervisorStatus` -> DENIED.
8. **Non-supervisor resolving `itemReports` to `'Selesai'`**: non-supervisor updating `itemReports` -> DENIED.
9. **Terminal state mutation on `itemReports`**: updating an already `'Selesai'` item report without admin -> DENIED.
10. **Shadow field injection**: adding unknown key `isVerified: true` on any write -> DENIED by `keys().hasOnly(...)`.
11. **Oversized photo payload**: `photos/{id}` `dataUrl.size() > 450000` -> DENIED.
12. **ID poisoning**: document ID > 128 chars or containing invalid characters -> DENIED by `isValidId()`.
