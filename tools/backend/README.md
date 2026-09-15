Hono backend server for [Cyberismo Solution](https://cyberismo.com/solution)

## Project events

`GET /api/projects/:prefix/events` is one SSE stream per tab, open to readers
and above; static exports do not connect. It emits:

- `ready`: `{ connectionId, presence }`, mapping every occupied card key to its
  complete user list.
- `presence.updated`: `{ cardKey, users }`, a replacement list for one card; an
  empty list means nobody is there.

`PUT /api/projects/:prefix/events/presence` takes
`{ connectionId, sequence, cardKey, mode }` and needs `APP_PRESENCE_ENABLED=true`.
`sequence` must increase within a connection; older requests are ignored. Renew
every 30 seconds, or the lease expires after 90. `cardKey: null` clears presence.

Locally: `APP_PRESENCE_ENABLED=true pnpm dev`, then visit `/api/auth/me?user=alice`
and `?user=bob` in separate browser profiles, reloading the app after a change.
