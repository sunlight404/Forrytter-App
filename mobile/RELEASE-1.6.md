# Version 1.6.0 – names and web notifications

- Administrators can read names of former stable members. Removed members retain their name and a removed label.
- Archived memberships are hidden from the management dropdown. Archiving does not delete historical records or the authentication account.
- Web Push opt-in under Min oversikt, plus test and disable controls, per device. iPhone requires the Home Screen web app and iOS 16.4 or newer. PC uses a compatible browser. Native APK push is not included in this release.
- Horse assignments, feeding assignments, swaps and common messages enqueue notifications. Task checkmarks and the automated rolling-year extension do not. Changes to the same topic are coalesced while pending. Notifications normally dispatch within a minute.
- Logout unregisters the device. Removing a member removes subscriptions and pending events. The dispatcher checks active membership again before sending.

## Server operation

Deploy supabase/functions/push-notifications with verify_jwt=false: the function validates client bearer tokens with Auth and active membership, and validates scheduled requests with a separate Vault-held worker secret. No service key, VAPID private key or worker token is returned to clients. Push URLs are restricted to known HTTPS push providers and redirects are refused.

The migrations install a private outbox, service-only RPCs, event triggers, Vault-managed VAPID keys and a one-minute cron job. Backoff retries stop after five attempts; expired device subscriptions are removed. The database is the single source of truth; a notification is only a prompt to open it.

The pg_net extension's catalog location triggers the [extension location advisory](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public). Its API objects are in net; public, anon and authenticated schema/function privileges are revoked. The extension was retained to avoid replacing live infrastructure. Existing unrelated security advisories remain unchanged.

## Verification

- Eight Node tests pass, including notification display, malformed payload and same-origin click navigation.
- Web and iOS exports pass. iOS export checks source compatibility, not App Store distribution.
- Rollback SQL tests cover event coalescing, recipient selection, swap notifications, subscription isolation, denied client access to secrets/outbox, and membership removal cleanup.
- Live worker bootstrap returned HTTP 200. Anonymous client and unauthorized worker requests returned HTTP 401.
- Real device delivery requires each user to activate notifications and press Send testvarsel. It has not been asserted from server-only tests.
