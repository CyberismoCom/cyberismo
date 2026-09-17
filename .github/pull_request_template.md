<!--
Thanks for the change. Keep the summary short; the detail belongs in the commits.
Security checks below are confirmed by the reviewer, not the author.
-->

## What changed

<!-- One or two sentences. Link the ticket, e.g. INTDEV-1234. -->

## How it was tested

<!-- Commands run, cases covered, or why tests were not needed. -->

## Security review

Confirmed by the reviewer against the [secure development guideline](https://github.com/CyberismoCom/cyberismo/blob/main/SECURE_DEVELOPMENT.adoc). Tick only what applies to this change; strike out or delete the rest rather than ticking it blind.

- [ ] **Input and types.** New boundary input is validated with a Zod schema. No `any`, `@ts-ignore` or unchecked cast used to bypass the type system.
- [ ] **Paths.** Any path built from a card key, project prefix or other caller-supplied value is resolved and confirmed to stay inside its intended root.
- [ ] **Execution.** No `eval`, dynamic `Function` or `vm`, no `exec` with interpolated input, no dynamic import from a caller-supplied path, no unsafe deserialization.
- [ ] **Access.** New or changed routes check the role *and*, where a resource is named, that the resource is in the caller's scope. Token checks cover signature, issuer and audience. No development auth bypass is reachable in a production build.
- [ ] **Dependencies.** New dependencies are maintained, vulnerability-free at add time, licence-clean (`pnpm check-licenses`), pinned exactly, and free of unexamined postinstall scripts.
- [ ] **Output.** No secrets in code, logs or error responses. Client-facing errors are generic; stack traces and internal paths stay server-side.
- [ ] **Findings.** Static analysis findings on touched files are fixed, justified, or recorded as a deviation. Any suppression states its reason.

<!--
Found a security problem in existing code? Do not describe it here.
This repository is public. Follow SECURITY.md.
-->
