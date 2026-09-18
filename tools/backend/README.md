Hono backend server for [Cyberismo Solution](https://cyberismo.com/solution)

## Project events

`GET /api/projects/:prefix/events` is one SSE stream per tab, open to readers
and above; static exports do not connect. It emits:

- `ready`: `{ connectionId, presence }`, mapping every occupied card key to its
  complete user list.
- `presence.updated`: `{ cardKey, users }`, a replacement list for one card; an
  empty list means nobody is there.
- `card.updated`: `{ cardKey, userId, userName }` after a card PATCH that wrote
  something, an attachment add or remove, or a link add, remove or update; link
  changes name every endpoint card, and a link update also names the previous
  target.

`PUT /api/projects/:prefix/events/presence` takes
`{ connectionId, sequence, cardKey, mode }`, where `mode` is `viewing` or
`editing`. `sequence` must increase within a connection; older requests are
ignored. Renew every 30 seconds, or the lease expires after 90. `cardKey: null`
clears presence. Responds 204, 400 if the body fails validation, or 404 for an
unknown card or a connection that is unknown or belongs to another user.

Locally: `pnpm dev`, then visit `/api/auth/me?user=alice` and `?user=bob` in
separate browser profiles, reloading the app after a change.
