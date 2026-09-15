---
name: todo-app-ticket-workflow
description: >-
  Runs the Todo-app git and Notion ticket workflow. Use when implementing a
  Notion Todo-app ticket, starting the next backlog item, branching, or
  committing feature/setup/fix work. After each storage mode is implemented,
  explain that storage and where it lives before starting another ticket.
---

# Todo-app ticket workflow

## After the user merges

Wait for the user. They push and merge. Do not start the next ticket until they say what to do next, unless they already named the next ticket in the same message.

## For each ticket

1. Find the next ticket on the Notion Todo-app board. Prefer Ready for Sprint, then P0, then dependency order.
2. Tell the user the ticket **name** before writing code.
3. Branch off **updated `main`** (not off the previous feature branch):

```bash
git checkout main
git pull
git checkout -b <prefix>/<short-name>
```

Prefixes:

- `feature/` — product or storage behaviour
- `setup/` — repo tooling, Makefile, skills, config
- `fix/` — bugs

4. Implement only that ticket. Keep UI off persistence APIs; go through `StorageAdapter`.
5. Commit locally. Do **not** push. Do **not** open a PR. The user pushes and merges.

## After each storage type

When ephemeral, persistent, or scalable storage lands, stop and explain:

- What that storage is
- Which files implement it
- How data is stored and when it is lost or kept
- How the UI selects it

Do this **before** starting the next ticket.

## Git rules

- Never push.
- Never update git config.
- One ticket per branch off `main`.
