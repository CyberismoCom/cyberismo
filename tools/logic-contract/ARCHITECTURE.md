# logic-contract architecture

A private, never published package of test code for the logic backend port of `@cyberismo/data-handler`
(`LogicBackend`): the contract suite every backend must pass. A distribution that implements the port runs the same
suite against its backend.

## Structure

| File                  | What it is                                                                    |
| --------------------- | ----------------------------------------------------------------------------- |
| `src/index.ts`        | `describeLogicBackendContract(name, create)`: the contract as a vitest suite. |
| `test/clingo.test.ts` | The contract on the default clingo backend.                                   |

## Dependencies

- `@cyberismo/data-handler` (package root only) for the port's types, `LogicError` and the clingo backend; vitest
  as a peer. data-handler does not depend on this package.

## Key concepts and invariants

- The suite asserts only what the port promises (`infra/logic/logic-backend.ts` in data-handler); what the port
  leaves unspecified (the committed programs after an abort, before the rebuild) is not tested.
