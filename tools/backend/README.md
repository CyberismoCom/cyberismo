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
  The client treats the connection as possibly stale, and shows a banner, if
  90 seconds pass with none. `card.updated` is emitted only by the cards
  router — an MCP, CLI or direct git write is silent — so content can be
  stale even on a healthy connection.
- `rotating`: an empty event sent once, immediately before the server ends
  the stream to rotate it; the reconnect that follows is expected, not a
  fault.
- `capped`: an empty event sent once, immediately before the server closes a
  connection to enforce the per-user cap (below). The client does not
  reconnect after this one, including on a back-forward-cache restore.

`PUT /api/projects/:prefix/events/presence` takes
`{ connectionId, sequence, cardKey, mode }`, where `mode` is `viewing` or
`editing`. `sequence` must increase within a connection; older requests are
ignored. Renew on each heartbeat, or the lease expires after 90 seconds.
`cardKey: null` clears presence. Below Editor, `mode: 'editing'` is silently
coerced to `viewing`. A card or mode change that arrives less than a second
after the connection's last one is not dropped, only delayed to when that
second is up, replacing any change still waiting from within the same
window — a renewal with the same card and mode is unaffected. This does
not throttle the requests themselves, only how often they can actually
change what gets broadcast, which caps the visible effect of a runaway
client loop and slows how fast a reader can enumerate every card's
occupants through this endpoint. Responds 204 either way, 400 if the body
fails validation, or 404 for an unknown card or a connection that is
unknown or belongs to another user.

Each user may hold at most 30 open connections per project: a dead TCP
connection does not clear until the rotation below eventually closes it, up
to 30 minutes away, and a browser restoring many tabs at once can otherwise
exhaust the ceiling well before then. A connection past the cap evicts the
oldest one for that user — preferring one not declared `editing`, since the
oldest tab is often the one mid-edit — sending it `capped` and closing it.
A connection retired for rotation (below) does not count toward the cap.

Every stream is closed and reopened on its own schedule: within 30 minutes
(jittered to 18-30 minutes so connections do not all rotate together after a
deploy), or 30 seconds before a bearer token's `exp` — or at `exp` itself if
the token already has less than 30 seconds left, rather than rotating into
an already-expired one. The client's reconnect re-runs authentication, so a
revoked token, a role change, a logout or offboarding take effect within one
rotation. Presence carries over the gap — the retiring connection's entry is
kept alive under the existing 90-second lease, so a card's occupant list
does not change because of a rotation.

The server bounds the outstanding writes per connection, dropping further
`presence.updated` events (never `card.updated`, `capped` or `rotating`)
once a stalled connection is holding too many; a dropped one is recorded as
delivered only once an attempt actually goes out, so the connection still
gets the current occupant list once it catches up. A disconnect from this
is only ever detected the normal way, on `onAbort`.

Locally: `pnpm dev`, then visit `/api/auth/me?user=alice` and `?user=bob` in
separate browser profiles, reloading the app after a change.
