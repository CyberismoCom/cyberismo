Hono backend server for [Cyberismo Solution](https://cyberismo.com/solution)

## Project events

`GET /api/projects/:prefix/events` is one SSE stream per tab, open to readers
and above; static exports do not connect. It emits:

- `ready`: `{ connectionId, presence }`, mapping every occupied card key to its
  complete user list.
- `presence.updated`: `{ cardKey, users }`, a replacement list for one card; an
  empty list means nobody is there.
- `card.updated`: `{ cardKey, userId, userName, actor }` for every card a write
  transaction created, changed, moved or re-ranked, whichever route made it
  (REST or MCP). A link change also names the cards whose inbound links changed.
  `actor` is `human`, or `agent` when an MCP client wrote on the user's behalf.
  Sent after the write is committed, and regardless of `APP_PRESENCE_ENABLED`.
- `changeset.updated`: `{ id, action, userId, userName }` when one of the
  project's changesets was `created`, `reviewed`, `reverted`, `updated`,
  `merged` or `discarded`.

`PUT /api/projects/:prefix/events/presence` takes
`{ connectionId, sequence, cardKey, mode }` and needs `APP_PRESENCE_ENABLED=true`.
`sequence` must increase within a connection; older requests are ignored. Renew
every 30 seconds, or the lease expires after 90. `cardKey: null` clears presence.

Locally: `APP_PRESENCE_ENABLED=true pnpm dev`, then visit `/api/auth/me?user=alice`
and `?user=bob` in separate browser profiles, reloading the app after a change.

## Changesets

A changeset collects changes on a git branch of its own, checked out in its own
worktree, until it is merged. The project needs to be in a git repository.

Every project route also works inside a changeset, under
`/api/projects/:prefix/changesets/:changeSetId/...` (for example
`.../changesets/:changeSetId/cards/:key`), including its own `events` stream.
Managing changesets, under `/api/projects/:prefix/changesets`:

| Method and path                                 | Role   | Does                                                                                                              |
| ----------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `GET /`                                         | reader | List changesets, active and closed                                                                                |
| `POST /` `{ title, activate? }`                 | editor | Start one from the project as it is now, and make it the user's active changeset unless `activate` is false (201) |
| `GET /active`                                   | reader | The user's active changeset: `{ changeSet }`, null in the project                                                 |
| `PUT /active` `{ id }`                          | editor | Switch the user's active changeset; `id: null` returns them to the project                                        |
| `GET /:id`                                      | reader | One changeset's record                                                                                            |
| `DELETE /:id`                                   | editor | Discard it; the branch stays as `refs/cyberismo/changesets/discarded/:id`                                         |
| `GET /:id/changes`                              | reader | What it changes, card by card, with review marks                                                                  |
| `GET /:id/changes/:key`                         | reader | One card before and after                                                                                         |
| `PUT /:id/changes/:key/reviewed` `{ reviewed }` | editor | Mark the card reviewed as it stands, or clear the mark (204)                                                      |
| `POST /:id/changes/:key/revert`                 | editor | Undo its changes to the card (204)                                                                                |
| `POST /:id/update` `{ resolutions? }`           | editor | Bring in the project's latest changes: `{ updated, conflicts }`                                                   |
| `POST /:id/merge`                               | editor | Merge into the project as the current user                                                                        |

An update that meets conflicts it cannot settle changes nothing and returns
them with every side (`base`, `ours`, `theirs`); retry with `resolutions`
mapping each path to `"ours"`, `"theirs"` or `{ "content": "..." }`. Merge
answers 409 when the project moved on since the last update, and 422 with
`errors` when the changeset adds validation errors. Unknown ids answer 404,
merged or discarded ones 409.

Each user has at most one active changeset per project; merging or discarding
it returns everyone who had it active to the project. The app works in it
through the URLs above. MCP sessions follow it implicitly: every tool call,
read or write, is served from the calling user's active changeset, tool
results and `list_projects` name it, and agents get `start_changeset` and
`get_changeset` tools, but none to merge, discard or review.

Worktrees go to `CYBERISMO_CHANGESETS_DIR` (default `~/.cyberismo/changesets`),
which must lie outside the folder scanned for projects. A changeset unused for
15 minutes is closed; its worktree stays.
