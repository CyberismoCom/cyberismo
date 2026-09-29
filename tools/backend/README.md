Hono backend server for [Cyberismo Solution](https://cyberismo.com/solution)

## Mock identities

With `AUTH_MODE=mock` the roster is on: alice (Admin), bob (Editor) and carol
(Reader). `?user=<name>` sets a `mock-user` cookie and `?role=<role>` a
`mock-role` cookie, both sticky until `=default` clears them; the cookie is
per browser profile, so a tab cannot outrank the profile it lives in.
`?as=<name>` names a roster identity for that one request without touching
either cookie, which is how a second participant is scripted from a tab
already signed in as someone else; being a one-shot identity rather than the
tab's session, it is not subject to that expiry. `?ttl=<seconds>` gives
the session an expiry, which is how rotation and the 401 after it can be
watched without waiting out the default stream lifetime; `?ttl=default`
clears it. `?user=`, `?as=` and `?ttl=` all need the roster, so `cyberismo app`
sessions can neither switch identity nor expire; `?role=` works either way.

Locally: `pnpm dev`, then visit `/api/auth/me?user=alice` and `?user=bob` in
separate browser profiles, reloading the app after a change. In one profile,
open the app as Alice and drive Bob from the console with `?as=bob`: his SSE
stream yields a `connectionId`, and `PUT .../events/presence?as=bob` or
`PATCH .../cards/:key?as=bob` then shows up in Alice's tab.
