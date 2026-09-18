# Secure development guideline

This document is the secure coding standard for the Cyberismo codebase. It states what a developer must do while writing code and what a reviewer confirms before approving a pull request.

It is maintained with the code. Any rule here may be changed in the same pull request as the change that makes it true.

Scope and boundaries:

- General development conventions (package manager, imports, testing, code style) are in `AGENTS.md`. This document covers security only.
- Governance, roles and the review cycle for the secure development process are managed in Cyberismo's internal information security management system and are not repeated here.
- A rule applies as soon as the code it covers exists. If the repository does not have that kind of code yet, the rule still applies the moment it does. Do not treat "we don't do that yet" as an exception.

In IEC 62443-4-1 terms this is the documented secure coding standard required by SI-1. Reviewers apply it during manual code review, and static analysis in CI enforces the parts a tool can check.

## Type safety

- TypeScript strict mode is on across all packages. Do not weaken it locally: no `any` as an escape hatch, and no `@ts-ignore` or `@ts-expect-error` without a comment on the same line stating why.
- Do not cast an unvalidated value into a type to satisfy the compiler. A cast asserts something the compiler cannot check. At a trust boundary, validate instead.

## Input validation

External input is validated at the boundary it enters, then trusted inside. A value that reaches business logic unvalidated has already crossed the boundary.

- Validate HTTP request bodies and query parameters, MCP tool arguments and environment configuration with a Zod schema at the boundary. Do not hand-roll ad hoc checks, and do not leave validation to the consumer.
- Card and configuration data read from disk is validated against the JSON Schema definitions in `@cyberismo/assets`. Extend a schema there rather than adding a second validation path for the same data.
- An entity id arriving in a request, such as a card key or project prefix, is unvalidated input. Do not assume it exists: resolve it against the project before you act on it or store it.

## Database access

Core card storage is file-based with Git integration. These rules apply wherever database access exists, including deployments built on this codebase.

- Use parameterised queries or the query builder's own bindings. Never assemble SQL by string concatenation or template interpolation with a caller-supplied value.
- Table and column names cannot be parameterised. If one has to be dynamic, resolve it against an allowlist rather than passing input through.
- Put the scope that limits rows to a tenant or project into the query itself. Fetching everything and filtering in application code is a data leak waiting for someone to forget the filter.
- Where the database supports row-level security, use it to enforce tenant isolation, so a query that forgets its scope returns nothing instead of another tenant's rows. The overlay Postgres database works this way: every table is scoped to `app.tenant_id`, set per transaction, and new tables stay under the same policy.

## Path and file handling

Cards live in a directory tree addressed by user-controlled identifiers such as card keys, project prefixes and module names. Building a path from user input is routine here, not a rare special case.

- Never build a filesystem path from a user-supplied string without confirming the result resolves inside the intended root. Resolve the path and check the prefix; do not compare strings before resolution.
- Reject identifiers containing `..`, absolute path segments or symlink components before they reach the filesystem.
- Treat imported and attached content as untrusted for path purposes, including content arriving from a module that looks trustworthy.

Reviewer note: for any new `fs` or `path` call with a variable segment, trace that segment back to where it enters the process.

## Process and dynamic execution

- No `eval`, `new Function(...)` or `node:vm` on any string derived from card content or user input.
- No `child_process.exec` with interpolated input. Use `execFile` or `spawn` with an argument array.
- No dynamic `import()` or `require()` of a path built from user input.
- Do not deserialize untrusted data with a format that can execute code, such as an unsafe YAML load.

## Rendered content

Card content is authored by users and rendered in the web view.

- Card content rendered as HTML goes through the existing sanitizer. Adding a render path that bypasses it is a defect, not a style choice.
- Do not decide how to render a file based on its extension or declared content type alone where rendering can execute script.
- Template helpers escape interpolated values by default. Use an unescaped helper only where the value was sanitized upstream, and note that at the call site.

## Authentication and authorization

- Authorization is a minimum-role check per route, nothing more. Every new route declares one, set to match what the route actually does, not what is convenient to test. The model is coarse, so a missing or too-loose role check is the entire access decision, not one layer among many.
- Token verification checks the signature, the issuer and the audience explicitly. Never treat a decoded but unverified claim as authoritative.
- Authentication failures are logged with the reason. A silent generic rejection leaves no audit trail and makes misconfiguration hard to diagnose.
- The mock authentication provider and any other development bypass must not be reachable in a production build. Adding a bypass, or widening an existing one, gets the same review attention as changing the real authentication path.
- The role model is mirrored by deployment components outside this repository. Changing the role enumeration, the role hierarchy or the claim mapping is a coordinated change, not a local one.

## Dependencies

- Add a dependency only when it is actively maintained, carries no known critical or high severity vulnerability at the time it is added, and has a licence permitted by `scripts/license-policy.json`. Run `pnpm check-licenses` before opening the pull request; CI enforces it.
- Commit the lockfile and treat it as the source of truth for installed versions. Ranges in `package.json` are fine; the lockfile pins what is actually installed.
- Look manually at any new dependency that ships native bindings or postinstall scripts before merging it.
- Vendoring or forking a dependency does not exempt it from review. Treat the vendored code as first-party code.
- Dependabot alerts are triaged rather than dismissed silently. Closing an alert without an upgrade requires a stated reason.

## Secrets and configuration

- No secret in source, fixtures or test files. This includes API keys, client secrets, private keys and committed `.env` files.
- No secret in a log statement, an error message, or any exception that reaches a client.
- Read secret configuration from the environment at runtime. Do not give a secret a hardcoded default that could survive into a deployment.

## Error handling and logging

- Errors reaching a client or CLI user carry a generic message. Stack traces, filesystem paths and internal identifiers stay in the server-side log.
- Do not log secrets, tokens or whole card contents. Log the card or entity identifier instead.

## Static analysis

CodeQL Advanced runs on every pull request, alongside ESLint and Prettier. The repository configuration is the source of truth for which rules are active; this section states the expectation, not the rule list.

- Static analysis runs in CI and blocks merge. A rule covering any class of defect described in this document is not suppressed repository-wide without a recorded reason.
- An inline suppression, whether an `eslint-disable` comment or a dismissed code scanning alert, states its reason. An unexplained suppression is a review failure.
- Every finding is resolved before merge in one of three ways: fixed, justified as a false positive, or recorded as a deviation. Postponing without a record is not a resolution.

## Deviations

A deliberate deviation from a rule in this document is recorded twice: as a short comment at the call site naming the rule and why it does not apply, and as a defect in defect management stating the accepted risk. A deviation recorded in only one place is a review failure, not something the reviewer can wave through.

## Reporting a vulnerability

Do not open a public issue or pull request describing an exploitable vulnerability. Follow the process in `SECURITY.md`.
