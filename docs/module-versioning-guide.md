# Module versioning & migrations — a guide for module authors

This explains what happens when you version a Cyberismo module and how your
changes reach the people who use it. If you publish a module that others
import, this is the mental model you need.

---

## 1. The one-paragraph mental model

Your module is a **git repo**; its versions are **git tags** (`v1.0.0`,
`v1.1.0`, …). When you make a **breaking change** to your module's resources,
Cyberismo records it. When you **seal a version**, those recorded changes
become a permanent **migration seal** for that version. Later, when someone who
installed an *older* version of your module updates to a newer one, Cyberismo
**replays your seals** to migrate *their own cards* — automatically. You never
touch their project; they never touch your module's files. Your job is just to
(1) make breaking changes through the proper commands so they get recorded, and
(2) seal versions cleanly.

```
Your module repo                         A consumer project
─────────────────                        ──────────────────
v1.0.0  ──seal──► migrationLog_1.0.0_1.1.0.jsonl  ┐
v1.1.0  ──seal──► migrationLog_1.1.0_1.2.0.jsonl  ├─► consumer runs `update-modules`
v1.2.0                                            │   → replays the chain on THEIR cards
                                                  ┘   → their cards migrate, project validates
```

---

## 2. Versions & sealing

- **Bump + seal:** `cyberismo create version <patch|minor|major>`. This bumps
  the version in `cardsConfig.json` and snapshots the current change log into a
  sealed file named `migrationLog_<from>_<to>.jsonl`. The first version is
  always `1.0.0`.
- **Publish:** commit, tag (`vX.Y.Z`), and push — `cyberismo publish` does the
  annotated tag + push for you. Consumers resolve versions from your tags.
- **The rules** (enforced by `create version` — see
  [the three change categories](#4-the-three-change-categories--what-each-bump-may-carry)):
  - **Patch** versions must have a **clean log** — no recorded changes at all.
    Use patches only for non-breaking fixes/additions.
  - **Minor** versions may carry **migratable** changes — they get sealed. A
    *destructive* change in the log makes a minor bump refuse.
  - **Major** versions may carry anything, including destructive changes.
- **The chain must be linear.** Consumers replay every seal from their installed
  version up to the target, end to end. Don't hand-rename or delete seal files,
  and don't skip versions — a gap makes the update refuse.

> Sealing requires a clean git working tree. Commit your breaking changes first,
> then `create version`, then commit the seal, then tag/publish.

---

## 3. What is a "breaking change" — and why you must use the commands

Breaking changes are recorded **only when you make them through the CLI mutation
commands**, never by hand-editing JSON. Hand-edits bypass the log, so consumers
get your new files but **no migration** — their old data is left stale.

Make breaking changes with:

| Change | Command |
|---|---|
| Remove an enum value | `cyberismo update <prefix>/fieldTypes/<f> remove enumValues '{"enumValue":"low"}' '{"enumValue":"medium"}'` |
| Change a field's data type | `cyberismo update <prefix>/fieldTypes/<f> change dataType shortText integer` |
| Rename a field type | `cyberismo update <prefix>/fieldTypes/<f> change name <old> <new>` |
| Remove a workflow state | `cyberismo update <prefix>/workflows/<w> remove states '{"name":"Deprecated","category":"closed"}' '{"name":"Approved","category":"closed"}'` |
| Change a card type's workflow | `cyberismo update <prefix>/cardTypes/<ct> change workflow <oldWf> <newWf> --mapping-file map.json` |
| Rename a card type | `cyberismo update <prefix>/cardTypes/<ct> change name <old> <new>` |

**Always provide the replacement / mapping** where offered — that's what lets a
consumer's card migrate cleanly instead of being left with a now-invalid value:

- enum-remove → give the replacement enum value,
- workflow remove-state → give the replacement state,
- workflow change → give a `--mapping-file` mapping old states → new states.

Without it, consumer cards keep the orphaned value and the update fails
validation.

Adding or removing a card type's **custom field** is *not* a breaking change
and is not recorded: values of a field the card type no longer declares stay
**dormant** on consumer cards instead of being deleted. `cyberismo clean`
surfaces dormant values and can remove them.

---

## 4. The three change categories — what each bump may carry

Every recorded change falls into one of three categories, and
`cyberismo create version` enforces which categories a bump may carry:

| Category | Meaning | Examples | Allowed in |
|---|---|---|---|
| **1 — no migration needed** | Consumers need nothing; the change is not recorded. | Add an enum value or workflow state; edit transitions; add/remove a card type's custom field; edit display names, descriptions, categories; delete a template, calculation, report, graph model, graph view, or skill. | patch, minor, major |
| **2 — migratable** | A sealed log entry replays the change losslessly on consumer data. | Rename any resource or the project prefix; rename an enum value or workflow state; change a card type's workflow (with a mapping); change a field's data type; remove an enum value or workflow state — always give the replacement. | minor, major |
| **3 — destructive** | Consumer data is discarded or orphaned; a replay cannot restore it. | Delete a card type, field type, workflow, or link type. | major only |

**Renaming a workflow transition is category 1** — cards never store transition
names, so consumers need no migration. But transition names appear as literals
in calculation `.lp` files (`onTransitionSetField`, `onTransitionExecuteTransition`,
`transitionDenied` facts), so when you rename a transition, update your own
module's calculations in the same release. No validation currently catches a
stale literal — a missed one silently disables the automation.

What the gate does at `create version`:

- **patch** refuses when the log contains *any* recorded change (category 2
  or 3), listing the offending entries.
- **minor** refuses when the log contains a **destructive** entry, listing the
  offending entries; migratable changes seal normally.
- **major** always seals, whatever the log contains.

### The maintainer contract

- Consumers may sit on any older version of your module. **Support old
  structures until your next MAJOR**: prefer category-1 and category-2
  changes; batch destructive removals into a major.
- **Before publishing a major** that carries destructive changes, provide
  migration instructions in your release notes: what is removed, which card
  data is affected, and what consumers should do about orphaned values
  (`cyberismo clean` reports dormant leftovers and can remove them).
- Deprecate first where you can: ship the replacement structure in a minor,
  then remove the old one in the next major.

---

## 5. The ownership rule (the most important thing)

**You can only migrate the values of resources *you own*.**

- Value migrations of *your* field/state are driven by *your* seals, and they
  reach **every** consumer card that holds that value — even cards whose card
  type is owned by a *different* module. (Selection is by the value/field, not by
  card-type name, so it survives card-type renames happening in the same update.)
- If your card type **references another module's** resource (e.g. your
  `Task` uses `base/fieldTypes/priority`), you can add or remove that
  *reference* structurally, but you **cannot migrate that field's values** —
  that's `base`'s job.

This is why replay "just works" for the common cases and never corrupts data: a
field's value has exactly one owner doing its migrations.

---

## 6. Cross-module references — stay compatible with your dependencies

If your module references another module's resource and that module **removes or
renames** it, your module must publish a **compatible version that drops or
updates the reference**. A consumer cannot fix your module's references — only
you can, by re-publishing.

Worked example (the safe pattern):
- `base@1.4.0` deletes `base/fieldTypes/priority`.
- Your module must ship a version that **removes `base/priority` from your card
  type's custom fields**.
- A consumer who updates *both together* to those compatible versions has their
  cards migrated cleanly (the field drops out, no dangling reference).
- A consumer who advances only one of you into an incompatible pair is **refused
  up front** — no broken state, but they're blocked until both are compatible.

So: keep your declared dependency ranges and your actual references in sync.

---

## 7. The one ordering hazard: `workflowState`

`workflowState` is special — it's co-owned: the **workflow** owns the state
names, and the **card type** points a card at a workflow. If, in a *single*
update, **your** module changes a card type's workflow **and another** module
renames/removes a state of a workflow involved, the result is order-dependent,
so Cyberismo **refuses** it (`split_workflow_ownership`). The remedy for the
consumer is to **update those two modules one at a time**.

To avoid imposing this on your users: try not to have a card type that uses
another module's workflow *and* re-point that workflow in the same release the
other module is changing its states.

---

## 8. How consumers resolve and update

When a consumer runs `cyberismo update-modules [name]`, Cyberismo:

1. **Resolves a coherent set of versions** across all their modules and your
   transitive dependencies, honoring every version range and pin. If no coherent
   set exists, it **refuses** with the conflict — it never advances greedily into
   a broken combination.
2. **Replays** your seal chain (and others') on the consumer's local cards.
3. **Validates** the whole project. On `--autocommit`, any failure rolls back
   cleanly to the last commit.

Implications for you:
- Declare your dependencies with **ranges** (`^1.0.0`) rather than exact pins
  unless you truly need a specific version — a pin forces every consumer to that
  exact version of your dependency and can block their other updates.
- A `patch`/`minor`/`major` you publish only reaches a consumer if their range
  allows it; design your bumps with semver intent.

---

## 9. Authoring checklist

- [ ] Make every breaking change via `cyberismo update / rename / remove` — never hand-edit resource JSON.
- [ ] Provide replacement values / mapping files for enum-remove, remove-state, and workflow changes.
- [ ] Don't rename or delete a field your *own* card types still reference — remove the reference first (authoring refuses otherwise).
- [ ] Keep cross-module references in step with your dependencies' versions; ship a compatible version when a dependency removes/renames something you use.
- [ ] Seal with `create version` (clean tree → commit → version → commit → tag); never hand-edit or skip seal files.
- [ ] Patches carry **no** recorded changes; group migratable changes into minors and destructive changes (structural deletes) into majors.
- [ ] Prefer dependency **ranges** over exact pins.
- [ ] Avoid re-pointing a card type's (cross-module) workflow in the same release the workflow's owner changes its states.

---

## 10. Quick worked example

```bash
# v1.0.0 — author resources
cyberismo create workflow flow
cyberismo create fieldType priority enum         # then set enum values: low, medium, high
cyberismo create cardType Task core/workflows/flow
cyberismo update core/cardTypes/Task add customFields '{"name":"core/fieldTypes/priority","isCalculated":false}'
git add -A && git commit -m "content"
cyberismo create version major                   # -> 1.0.0
git add -A && git commit -m "seal 1.0.0" && git tag v1.0.0

# v1.1.0 — a breaking change, recorded + sealed
cyberismo update core/fieldTypes/priority remove enumValues '{"enumValue":"low"}' '{"enumValue":"medium"}'
git add -A && git commit -m "enum-remove low"
cyberismo create version minor                   # -> 1.1.0, seals migrationLog_1.0.0_1.1.0.jsonl
git add -A && git commit -m "seal 1.1.0" && git tag v1.1.0
cyberismo publish                                # push tags to the remote
```

A consumer on `core@1.0.0` with a card whose `priority` is `low`, running
`update-modules core`, ends up on `1.1.0` with that card's `priority` migrated to
`medium` — automatically, and validated.
