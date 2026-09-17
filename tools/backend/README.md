Hono backend server for [Cyberismo Solution](https://cyberismo.com/solution)

## Project events

`GET /api/projects/:prefix/events` is one SSE stream per tab, open to readers
and above; static exports do not connect. It emits:

- `ready`: `{ connectionId }`. A new connection has not declared a card yet,
  and the events below are delivered only to connections subscribed to the
  card they concern.
- `presence.updated`: `{ cardKey, users }`, a replacement list for one card,
  delivered only to connections currently subscribed to that card. A
  connection always receives the current list the moment it declares the
  card; a connection already on the card is sent it again only when the
  list actually changed. The recipient's own connection is always among
  `users`, so a delivered list is never empty.
- `card.updated`: `{ cardKey, userId?, userName? }`, delivered only to
  connections subscribed to that card, after a card PATCH that wrote
  something, an attachment add or remove, or a link add, remove or update;
  link changes name every endpoint card, and a link update also names the
  previous target. `userId`/`userName` are present only for Editor and above.
- `hb`: an empty event every 30 seconds; presence renewal (below) rides it.
- `rotating`: an empty event sent once, immediately before the server ends
  the stream to rotate it; the reconnect that follows is expected, not a
  fault.

`PUT /api/projects/:prefix/events/presence` takes
`{ connectionId, sequence, cardKey, mode }`, where `mode` is `viewing` or
`editing`. `sequence` must increase within a connection; older requests are
ignored. Renew on each heartbeat, or the lease expires after 90 seconds.
`cardKey: null` clears presence. Below Editor, `mode: 'editing'` is silently
coerced to `viewing`. Responds 204 either way, 400 if the body fails
validation, or 404 for an unknown card or a connection that is unknown or
belongs to another user.

Every stream is closed and reopened on its own schedule: within 30 minutes
(jittered to 18-30 minutes so connections do not all rotate together after a
deploy), or 30 seconds before a bearer token's `exp` — or at `exp` itself if
the token already has less than 30 seconds left, rather than rotating into
an already-expired one. The client's reconnect re-runs authentication, so a
revoked token, a role change, a logout or offboarding take effect within one
rotation. Presence carries over the gap — the retiring connection's entry is
kept alive under the existing 90-second lease, so a card's occupant list
does not change because of a rotation.

Locally: `pnpm dev`, then visit `/api/auth/me?user=alice` and `?user=bob` in
separate browser profiles, reloading the app after a change.
