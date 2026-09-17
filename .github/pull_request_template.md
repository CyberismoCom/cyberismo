## What changed

<!-- One or two sentences. Link the ticket, e.g. INTDEV-1234. -->

## How it was tested

<!-- What you ran, and anything you checked by hand. -->

## Security considerations

<!--
Say what this change does to any of the areas below, and what you did about it.
Example: "adds a route, Editor role required, card key resolved before use".

"None" is a valid answer and a claim you are making. Do not write it on a change
that touches the list below.

  Input      Validate boundary input with a Zod schema. Card and configuration data
             read from disk goes through the JSON Schema definitions in
             @cyberismo/assets. An identifier from a request is resolved against the
             project before use. No `any` or `@ts-ignore` to get past the types.
  Paths      A path built from a card key, project prefix or module name is resolved
             and confirmed to stay inside its intended root.
  Execution  No eval, dynamic Function or vm, no exec with interpolated input, no
             dynamic import from a caller-supplied path.
  Access     Every route declares a minimum-role check, and the minimum matches what
             the route does. It is the whole access decision, not one layer of several.
  Secrets    Nothing secret in code, fixtures, logs or error responses. Client-facing
             errors stay generic.
  Deps       New dependencies maintained, pinned exactly, and licence-clean
             (`pnpm check-licenses`).

Guideline: https://github.com/CyberismoCom/cyberismo/blob/main/SECURE_DEVELOPMENT.md

-->
