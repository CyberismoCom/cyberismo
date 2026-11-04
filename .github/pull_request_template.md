## What changed

<!-- One or two sentences. Link the ticket, e.g. INTDEV-1234, and the OpenSpec change if there is one (openspec/changes/<name>/). -->

## Change class

<!-- One of: M (mechanical: moves, renames, codemod), R (refactor, same behaviour), B (behaviour change). See docs/dev/review-rubric.md. -->

## Behaviour vs main

<!--
B: list every behaviour change a user, API caller or on-disk file would see.
R/M: "None", plus any test assertion you edited and why.
-->

## Architecture impact (optional)

<!-- Only if the change alters a package's architecture: which tools/<pkg>/ARCHITECTURE.md you updated. -->

## Tests

<!--
Level of each new test (unit / API / adapter / e2e, docs/dev/testing.md) and the
scenarios it covers (`<capability>: <Scenario name>`). One line per new test: the mutation it catches.
Bug fix: confirm the test fails without the fix.
Deleted or moved tests: say why (duplicate / dead / moved).
Anything checked by hand (race verification, app / static site / PDF export).
-->

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
  Deps       New dependencies maintained and licence-clean
             (`pnpm check-licenses`).

Guideline: https://github.com/CyberismoCom/cyberismo/blob/main/SECURE_DEVELOPMENT.md

-->
