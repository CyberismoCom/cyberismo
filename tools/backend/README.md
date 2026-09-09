Hono backend server for [Cyberismo Solution](https://cyberismo.com/solution)

## Project events

The app keeps one SSE connection to `GET /api/projects/:prefix/events` per tab
and active project. Readers can subscribe. Navigating between cards or entering
edit mode does not reopen the connection.

- `ready`: `{ connectionId, presence }`, where `presence` maps occupied card keys
  to complete user lists. Replace previous presence state on reconnection.
- `presence.updated`: `{ cardKey, users }`, a replacement list for one card.
  An empty list clears that card's presence.
- `card.updated`: `{ cardKey, userId, userName }`, an explicit notification from
  a successful card PATCH, attachment change, or link change. Link changes
  notify the known endpoint cards. Empty PATCH bodies do not notify.

Only the open card handles its update notification: it refetches that card's
rendered and raw data, and shows who changed it. Editing users receive a warning
while their draft is preserved. The current user's own updates refetch silently.
Other cards and project caches retain their normal SWR revalidation behavior.
There is no broad invalidation on connection or reconnection, and no event replay.

These events provide user awareness, not exhaustive change tracking. They do not
observe the write lock, MCP commands, external filesystem writes, or every card
changed by workflow side effects. Notifications name only explicitly known cards.

With `APP_PRESENCE_ENABLED=true`, clients report presence using
`PUT /api/projects/:prefix/presence` with
`{ connectionId, sequence, cardKey, mode }`. The connection belongs to the
request's authenticated user. `sequence` increases within that connection;
older requests are ignored. `cardKey: null` clears presence. Renew active
presence every 30 seconds; it expires after 90 seconds without renewal.
Connections are tracked separately and combined by user for display.

Presence reporting and indicators can be disabled independently of card-update
notifications. Static exports do not connect.

For local testing, run `APP_PRESENCE_ENABLED=true pnpm dev`. Use separate browser
profiles and visit `/api/auth/me?user=alice&role=default` and
`/api/auth/me?user=bob&role=default`, then open the same card. The mock identities
are stored in cookies; reload the app after changing them.
