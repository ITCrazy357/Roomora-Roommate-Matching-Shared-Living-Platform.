# Chat presence

- `POST /api/v1/presence/heartbeat`, body `{ "idleSeconds": 0 }` (integer 0–179).
  AuthGuard and OriginGuard protect the endpoint. The user/session come from
  authentication, never the request body. ADMIN does not participate in chat.
- `person.presence` in conversation list/detail and `members[].presence` in House
  detail return `{ online, lastActiveAt }`. Existing conversation/block and current
  House membership checks apply; there is no public user-presence lookup.
- A usable session with activity less than 3 minutes ago means online. Revoked,
  expired, untouched sessions and locked accounts do not count. Multiple tabs and
  devices share the account status; the latest activity is kept after logout.
- The browser records opening/returning to a visible page, pointer/keyboard,
  wheel and touch interaction anywhere in Roomora. It sends at most once per
  30 seconds, only if interaction changed. SSE, polling and automatic chat scrolling
  do not renew activity. The server uses its clock minus `idleSeconds` and preserves
  the newest timestamp with an atomic PostgreSQL update. Transactions lock the user
  before sessions, matching login/account moderation; writes are throttled to
  15 seconds per session.
- Presence refreshes through SSE invalidations and a 60-second recovery sync.
  Lightweight heartbeats still recheck session revocation every 20 seconds.
  Visible tabs debounce bursts and use `GET /api/v1/updates/unread` for counters
  instead of fetching conversation/notification bodies. Hidden tabs defer sync
  until focus/visibility returns; authorization stays on each underlying API.
  The shared client clock updates elapsed labels every 15 seconds and expires a
  stale green dot locally. A disconnected stream suppresses green status.
- Migration: `20261011160000_chat_presence` adds nullable activity timestamps to
  users and sessions; old data is not assigned an invented activity time.
- Checks: `test/presence.e2e-spec.ts` covers HTTP/PostgreSQL access, idle threshold,
  concurrency, multiple sessions and logout. Frontend `test/presence.test.mjs`
  covers elapsed labels and the three-minute boundary.
