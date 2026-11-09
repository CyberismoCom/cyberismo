// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type * as NodeClingo from '@cyberismo/node-clingo';
import {
  LogicError,
  type Diagnostic,
  type LogicBackend,
  type LogicBackendFactory,
  type LogicTransaction,
  type Program,
  type QueryResult,
} from './logic-backend.js';

// The category every program is stored in; a query solves all of them.
const ALL = 'all';
// The name node-clingo gives the text passed to a solve.
const QUERY_PROGRAM = '__program__';

// Loaded on first use, so a process that uses another backend never loads
// the native binding.
let binding: Promise<typeof NodeClingo> | undefined;
function nodeClingo(): Promise<typeof NodeClingo> {
  binding ??= import('@cyberismo/node-clingo');
  return binding;
}

function diagnostics(
  errors: string[],
  warnings: string[],
  key?: string,
): Diagnostic[] {
  return [
    ...errors.map((message) => ({ severity: 'error' as const, message, key })),
    ...warnings.map((message) => ({
      severity: 'warning' as const,
      message,
      key,
    })),
  ];
}

/**
 * One clingo context per checkout. Changes apply in place, as the write lock
 * admits no other caller during a write; abort puts back the programs the
 * transaction changed. Nothing is refused at commit, which would solve the
 * whole project on every write.
 */
class ClingoBackend implements LogicBackend {
  private context?: NodeClingo.ClingoContext;
  // Texts of the stored programs by key.
  private readonly texts = new Map<string, string>();
  private open = false;
  private closed = false;

  private async ctx(): Promise<NodeClingo.ClingoContext> {
    if (this.closed) {
      throw new LogicError('unavailable', 'The logic backend is closed');
    }
    const { ClingoContext } = await nodeClingo();
    this.context ??= new ClingoContext();
    return this.context;
  }

  async begin(): Promise<LogicTransaction> {
    const ctx = await this.ctx();
    if (this.open) {
      throw new LogicError('internal', 'A logic transaction is already open');
    }
    this.open = true;
    let ended = false;
    const live = () => {
      if (ended) {
        throw new LogicError('internal', 'The logic transaction has ended');
      }
    };
    const end = () => {
      live();
      ended = true;
      this.open = false;
    };
    const store = (key: string, text: string | undefined) => {
      if (text === undefined) {
        ctx.removeProgram(key);
        this.texts.delete(key);
      } else {
        ctx.setProgram(key, text, [ALL]);
        this.texts.set(key, text);
      }
    };
    // Each changed program's committed text, undefined if it had none.
    const before = new Map<string, string | undefined>();
    const put = (key: string, text: string | undefined) => {
      if (!before.has(key)) before.set(key, this.texts.get(key));
      store(key, text);
    };
    const set = (programs: Program[]) => {
      for (const { key, text } of programs) put(key, text);
    };
    const remove = (keys: string[]) => {
      for (const key of keys) put(key, undefined);
    };
    return {
      set: (programs) => {
        live();
        set(programs);
      },
      remove: (keys) => {
        live();
        remove(keys);
      },
      replaceAll: (programs) => {
        live();
        // Setting before removing keeps the parse of unchanged programs.
        set(programs);
        const kept = new Set(programs.map((program) => program.key));
        remove([...this.texts.keys()].filter((key) => !kept.has(key)));
      },
      query: async (text) => {
        live();
        return this.query(text);
      },
      commit: async () => end(),
      abort: async () => {
        end();
        for (const [key, text] of before) store(key, text);
      },
    };
  }

  async query(text: string): Promise<QueryResult> {
    const { answers } = await this.solve(text, [ALL]);
    return { answers };
  }

  async check(programs: Program[]): Promise<Diagnostic[]> {
    const { validateProgram } = await nodeClingo();
    return programs.flatMap(({ key, text }) => {
      const { errors, warnings } = validateProgram(text);
      return diagnostics(errors, warnings, key);
    });
  }

  async exportText(): Promise<string> {
    return (await this.ctx()).buildProgram('', [ALL]);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.context?.removeAllPrograms();
    this.context = undefined;
    this.texts.clear();
  }

  private async solve(
    text: string,
    references: string[],
  ): Promise<NodeClingo.ClingoResult> {
    const ctx = await this.ctx();
    const { ClingoError } = await nodeClingo();
    try {
      return await ctx.solve(text, references);
    } catch (error) {
      if (error instanceof ClingoError) {
        const key =
          error.details.program && error.details.program !== QUERY_PROGRAM
            ? error.details.program
            : undefined;
        throw new LogicError(
          'invalid',
          error.message,
          diagnostics(error.details.errors, error.details.warnings, key),
          { cause: error },
        );
      }
      throw error;
    }
  }
}

/** Makes a clingo backend; the default of every checkout. */
export const clingoLogicBackend: LogicBackendFactory = () =>
  new ClingoBackend();
