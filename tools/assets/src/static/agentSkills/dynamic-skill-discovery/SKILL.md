---
name: dynamic-skill-discovery
description: Discover and apply Cyberismo project skills via the MCP server. Use before acting on any task in a Cyberismo project.
---

# Dynamic Skill Discovery

This project uses a dynamic skill system managed by the Cyberismo platform.
Available skills change based on the current state of project resources, workflow
steps, and application context.

## Discovering available skills

Before acting on a task, check what skills are available:

1. Call the `list_skills` tool on the Cyberismo MCP server to see all currently
   enabled skills. You can filter by `category` or `cardKey` if you know the context.
2. Review the returned skill names and descriptions to identify which skills are
   relevant to the task at hand. Each skill has a `scope`: `global` (usable
   anywhere) or `card` (enabled for specific cards — pass a `cardKey` to `get_skill`).
3. Call the `get_skill` tool with the skill's `name` to retrieve full instructions
   for any skill you need to apply.

## Applying a discovered skill

Each skill returned by `get_skill` contains: metadata (name, description, category),
a `relatedTools` array listing the MCP tools used by the skill, and full instructions
in the `instructions` field. Follow the instructions as you would any project skill.
The `relatedTools` field tells you which tools you will need.

## Important

- Do not cache or assume skill availability across tasks. Always re-discover before
  acting, as available skills may have changed.
- Skills are enabled by the project's logic rules. If a skill you expect is not
  listed, its preconditions are not currently met.
- Prefer `list_skills` first, then `get_skill` for specific skills, rather than
  fetching all skill contents at once.
