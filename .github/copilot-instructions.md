# Cyberismo Development Guide

This document provides guidance for AI assistants and developers working on the Cyberismo codebase.

## Project Overview

**Cyberismo** is an open-source security-as-code platform for managing cybersecurity content, compliance, and reporting. It provides a card-based project management system with:

- File-based storage (no database required)
- Answer Set Programming (ASP) via Clingo for complex calculations
- AsciiDoc content with extensible macros
- Workflow state machines
- Modular architecture with hub-based module sharing

**License**: AGPL-3.0 | **Website**: https://cyberismo.com | **Docs**: https://docs.cyberismo.com

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │    CLI Tool     │     │   Electron      │
│   (React/Vite)  │     │   (Commander)   │     │   Desktop App   │
│   tools/app     │     │   tools/cli     │     │  tools/electron │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │  HTTP/REST            │  Direct               │  Embedded
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Hono Web Server)                        │
│                          tools/backend                               │
│   API Routes: /api/cards, /api/cardTypes, /api/workflows, etc.      │
└────────────────────────────────┬────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  DATA HANDLER (Core Business Logic)                  │
│                       tools/data-handler                             │
│  CommandManager → Commands → Resource Handlers → File System        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20.x or 22.x, pnpm 10.8.0 |
| Backend | Hono 4.x, TypeScript 5, Zod 4.x |
| Frontend | React 19, Vite 7, MUI Joy, Redux Toolkit, SWR |
| Testing | Vitest (frontend/backend), Mocha (cli/data-handler), Cypress (E2E) |
| Logic Programming | Clingo ASP solver via node-clingo |
| Content | AsciiDoc with AsciiDoctor 3.x |

---

## Monorepo Structure

```
cyberismo/
├── tools/
│   ├── app/              # React frontend (Vite)
│   ├── backend/          # Hono REST API server
│   ├── cli/              # Commander.js CLI tool
│   ├── data-handler/     # Core business logic engine
│   ├── assets/           # JSON schemas & static resources
│   ├── migrations/       # Schema migration system
│   ├── node-clingo/      # C++ Clingo bindings for Node.js
│   └── electron/         # Desktop app wrapper
├── scripts/              # Release & build scripts
└── .github/workflows/    # CI/CD pipelines
```

---

## Core Domain Concepts

### Cards
The fundamental unit of content with key, AsciiDoc content, metadata, children, and attachments.

### CardTypes
Define card structure: associated workflow and custom fields.

### Workflows
State machines with states (initial/active/closed) and transitions.

### Templates
Reusable card structures with pre-defined content.

### FieldTypes
Custom field definitions: boolean, date, dateTime, enum, integer, list, longText, number, person, shortText.

### Calculations
Clingo ASP logic programs for computed values.

---

## Key Patterns

### API Endpoints (Hono)
```typescript
// tools/backend/src/domain/<feature>/index.ts
import { Hono } from 'hono';
import { zValidator } from '../middleware/zvalidator';
import { schema } from './schema';
import * as service from './service';

const app = new Hono();
app.get('/', async (c) => {
  const commands = c.get('commands');
  const result = await service.getAll(commands);
  return c.json(result);
});
```

### Zod Validation
```typescript
// tools/backend/src/domain/<feature>/schema.ts
import { z } from 'zod';

export const createSchema = z.object({
  identifier: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  name: z.string().min(1),
});
```

### React Components
```typescript
// tools/app/src/components/<Feature>.tsx
import { useCard } from '@/lib/api/cards';
import { useAppSelector } from '@/lib/hooks/redux';
import { Box, Button, Typography } from '@mui/joy';

export function FeatureComponent({ cardKey }: Props) {
  const { data: card, error } = useCard(cardKey);
  // Use MUI Joy components
}
```

### Redux Slices
```typescript
// tools/app/src/lib/slices/<feature>.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export const featureSlice = createSlice({
  name: 'feature',
  initialState,
  reducers: {
    setFeature: (state, action: PayloadAction<Feature>) => {
      state.value = action.payload;
    },
  },
});
```

### Command Pattern (Data Handler)
```typescript
// tools/data-handler/src/commands/<command>.ts
export class CommandName {
  constructor(private project: Project) {}

  async execute(options: CommandOptions): Promise<Result> {
    // Implementation
  }
}
```

---

## Domain Types

```typescript
// Core card structure
interface Card {
  key: string;           // e.g., "proj_abc123"
  path: string;
  content?: string;      // AsciiDoc
  metadata?: CardMetadata;
  children: string[];
  attachments: CardAttachment[];
}

// Workflow transitions
interface Workflow {
  name: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

// Field types
type DataType = 'boolean' | 'date' | 'dateTime' | 'enum' |
                'integer' | 'list' | 'longText' | 'number' |
                'person' | 'shortText';
```

---

## Key Files

### Entry Points
- `tools/app/src/main.tsx` - Frontend entry
- `tools/backend/src/index.ts` - Server entry
- `tools/cli/bin/run` - CLI entry
- `tools/data-handler/src/index.ts` - Core API exports

### Core Logic
- `tools/data-handler/src/command-manager.ts` - Command orchestration
- `tools/data-handler/src/containers/project.ts` - Project container

### Types
- `tools/data-handler/src/interfaces/project-interfaces.ts` - Core domain types
- `tools/data-handler/src/interfaces/resource-interfaces.ts` - Resource types

---

## File Conventions

- `*.test.ts` - Test files
- `*.schema.ts` - Zod schemas
- `index.ts` - Public exports
- `service.ts` - Business logic
- `*.lp` - Clingo logic programs
- `*.adoc` - AsciiDoc content
- `*.hbs` - Handlebars templates

---

## Development Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages
pnpm dev              # Run all in dev/watch mode
pnpm test             # Run all tests
pnpm lint             # Lint all packages
pnpm prettier-fix     # Fix formatting
pnpm --filter <pkg>   # Run in specific package
```

---

## Testing

```typescript
// Vitest (frontend/backend)
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should work', () => {
    expect(result).toBe(expected);
  });
});

// Mocha (cli/data-handler)
import { expect } from 'chai';

describe('Feature', () => {
  it('should work', () => {
    expect(result).to.equal(expected);
  });
});
```

---

## Common Imports

```typescript
// Backend
import { Hono } from 'hono';
import { z } from 'zod';
import { CommandManager } from '@cyberismo/data-handler';

// Frontend
import { Box, Button, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
```

---

## AsciiDoc Macros

```asciidoc
vegalite::path/to/spec.json[]     // Vega-Lite visualization
include::card_key[]               // Include content from card
xref:card_key[]                   // Cross-reference to card
createCards::template[count=5]    // Create cards from template
report::report_name[param=value]  // Generate report
graph::model/view[]               // Render graph
```

---

## Don'ts

- Use `any` type without justification
- Skip Zod validation for API inputs
- Use class components in React
- Mutate Redux state directly
- Skip error handling in async operations
- Add database dependencies (file-based only)

---

## Useful Links

- [Cyberismo Docs](https://docs.cyberismo.com)
- [AsciiDoc Syntax](https://docs.asciidoctor.org/asciidoc/latest/syntax-quick-reference/)
- [Clingo/ASP Guide](https://potassco.org/clingo/)
- [Hono Documentation](https://hono.dev/)
- [MUI Joy Components](https://mui.com/joy-ui/getting-started/)
