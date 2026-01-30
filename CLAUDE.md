# CLAUDE.md

This file provides guidance for Claude Code when working with the Cyberismo codebase.

## Project Overview

**Cyberismo** is an open-source cybersecurity management tool ("Cards: a Tool for Managing Cybersecurity in Software"). It provides a card-based system for managing cybersecurity artifacts, risks, compliance documentation, and organizational knowledge with graph models, calculations, and workflow automation.

The project is a **pnpm monorepo** with packages in `tools/`.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                 │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│                     │                     │                                 │
│   ┌─────────────┐   │   ┌─────────────┐   │   ┌─────────────────────────┐   │
│   │    CLI      │   │   │  React App  │   │   │   Electron (Desktop)   │   │
│   │ @cyberismo/ │   │   │ @cyberismo/ │   │   │   (packaging only)     │   │
│   │    cli      │   │   │    app      │   │   │                         │   │
│   └──────┬──────┘   │   └──────┬──────┘   │   └─────────────────────────┘   │
│          │          │          │          │                                 │
└──────────┼──────────┴──────────┼──────────┴─────────────────────────────────┘
           │                     │
           │    ┌────────────────┘
           │    │
           ▼    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API LAYER                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Backend (@cyberismo/backend)                        │  │
│  │                                                                        │  │
│  │   Hono REST API Server         Static File Serving                    │  │
│  │   ├── /api/cards               (serves React app)                     │  │
│  │   ├── /api/cardTypes                                                  │  │
│  │   ├── /api/calculations                                               │  │
│  │   ├── /api/graphModels                                                │  │
│  │   ├── /api/workflows                                                  │  │
│  │   ├── /api/templates                                                  │  │
│  │   ├── /api/reports                                                    │  │
│  │   └── ... (17 API routers)                                            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CORE ENGINE                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                Data Handler (@cyberismo/data-handler)                  │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │ Command Handler │  │    Resources    │  │       Macros        │    │  │
│  │  │                 │  │                 │  │                     │    │  │
│  │  │ - add           │  │ - cards         │  │ - include           │    │  │
│  │  │ - calc          │  │ - cardTypes     │  │ - report            │    │  │
│  │  │ - create        │  │ - fieldTypes    │  │ - scoreCard         │    │  │
│  │  │ - edit          │  │ - workflows     │  │ - graph             │    │  │
│  │  │ - export        │  │ - graphModels   │  │ - vega/vegalite     │    │  │
│  │  │ - import        │  │ - linkTypes     │  │ - createCards       │    │  │
│  │  │ - move          │  │ - templates     │  │ - xref              │    │  │
│  │  │ - transition    │  │ - calculations  │  │ - percentage        │    │  │
│  │  │ - validate      │  │ - logicPrograms │  │ - image             │    │  │
│  │  │ - ... (15+ ops) │  │ - labels        │  │                     │    │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │  │
│  │  │   Containers    │  │   Migrations    │  │    Git Operations   │    │  │
│  │  │ (project mgmt)  │  │ (schema evolve) │  │   (multi-user)      │    │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌───────────────────────┐ ┌─────────────────┐ ┌───────────────────────────────┐
│       Assets          │ │   Migrations    │ │         Node-Clingo           │
│  @cyberismo/assets    │ │  @cyberismo/    │ │    @cyberismo/node-clingo     │
│                       │ │   migrations    │ │                               │
│ - JSON Schemas        │ │                 │ │  C++ bindings for Clingo      │
│ - Static resources    │ │ - Version mgmt  │ │  Answer Set Solver            │
│ - Hub definitions     │ │ - Schema        │ │                               │
│ - Calculations        │ │   evolution     │ │  Used for:                    │
│ - Export templates    │ │                 │ │  - Logic programs             │
│                       │ │                 │ │  - Constraint solving         │
└───────────────────────┘ └─────────────────┘ │  - Calculations               │
                                              └───────────────────────────────┘
```

## Package Dependencies

```
@cyberismo/cli
├── @cyberismo/backend
│   ├── @cyberismo/data-handler
│   │   ├── @cyberismo/assets
│   │   ├── @cyberismo/migrations
│   │   └── @cyberismo/node-clingo
│   └── @cyberismo/app (dev)
└── @cyberismo/data-handler
```

## Directory Structure

```
cyberismo/
├── tools/                      # All packages live here
│   ├── app/                    # React frontend (Vite, MUI/Joy)
│   ├── assets/                 # Schemas, static resources
│   ├── backend/                # Hono REST API server
│   ├── cli/                    # Commander-based CLI
│   ├── data-handler/           # Core business logic engine
│   ├── electron/               # Desktop app packaging
│   ├── migrations/             # Schema migration system
│   └── node-clingo/            # Native C++ Clingo bindings
├── scripts/                    # Release and migration utilities
├── Dockerfile                  # Multi-stage Docker build
├── pnpm-workspace.yaml         # Workspace configuration
└── eslint.config.js            # Shared ESLint config
```

## Key Entry Points

| Package | Entry Point |
|---------|-------------|
| CLI | `tools/cli/bin/run` |
| Backend | `tools/backend/src/main.ts` |
| App | `tools/app/src/main.tsx` |
| Data Handler | `tools/data-handler/src/index.ts` |
| Command Handler | `tools/data-handler/src/command-handler.ts` |

## Common Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint all packages
pnpm lint

# Format code
pnpm prettier-fix

# Development mode (all packages in parallel)
pnpm dev

# Build Docker image
pnpm build-docker
```

## Testing

- **Unit tests**: Mocha (cli, data-handler), Vitest (backend, app, node-clingo)
- **E2E tests**: Cypress (app)
- **Test data**: `tools/data-handler/test/test-data/`

Run tests per package:
```bash
pnpm --filter @cyberismo/data-handler test
pnpm --filter @cyberismo/app test
pnpm --filter @cyberismo/backend test
```

## Technology Stack

- **Runtime**: Node.js >=20.0.0, TypeScript 5, pnpm 10.8.0
- **Backend**: Hono, Zod validation, AsciiDoctor, simple-git
- **Frontend**: React 19, Redux Toolkit, MUI/Joy, CodeMirror, Vega
- **Native**: Clingo (C++ constraint solver via node-gyp)
- **CI/CD**: GitHub Actions, CodeQL, Docker

## Core Concepts

1. **Cards**: Primary data model for cybersecurity artifacts
2. **Resources**: Typed data containers (cardTypes, fieldTypes, workflows, calculations, etc.)
3. **Macros**: Content generation system (reports, graphs, includes, scoring)
4. **Calculations**: Logic programs using Clingo for constraint solving
5. **Commands**: 15+ operations (create, edit, move, validate, export, import, etc.)
6. **Migrations**: Schema versioning for backward compatibility

## Code Style

- ESLint flat config with TypeScript strict mode
- Prettier for formatting
- Async/promise best practices enforced
- AGPL-3.0 license

## Ground rules

Always when learning something new, add an entry or modify CLAUDE.md accordingly.
