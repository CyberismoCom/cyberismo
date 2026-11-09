// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { DomainError } from '../../shared/exceptions/index.js';

/**
 * Where one opened checkout's logic programs are kept and its queries
 * answered.
 *
 * The caller (the checkout) promises:
 * - At most one transaction is open, and only while the checkout's write lock
 *   is held; no `LogicBackend.query` runs while it is open.
 * - After `abort`, or a `commit` that rejected, it replaces every program
 *   (`replaceAll` in a new transaction) before any other call.
 * - Nothing is called after `close`.
 *
 * The backend promises:
 * - `LogicTransaction.query` sees the transaction's changes;
 *   `LogicBackend.query` sees the committed programs.
 * - A failed `LogicTransaction.query` leaves the transaction open.
 * - After `abort` the committed programs are unspecified until the caller's
 *   rebuild, so a backend may apply changes in place.
 * - `check` never waits for an open transaction.
 * - It fails with `LogicError`s. A backend that lost its programs fails the
 *   call with kind `unavailable` and asks for them with
 *   `LogicBackendOwner.resync`, without awaiting it inside its own call.
 */
export interface LogicBackend {
  /** Opens the write transaction. */
  begin(): Promise<LogicTransaction>;
  /** Solves `text` together with the committed programs. */
  query(text: string): Promise<QueryResult>;
  /**
   * Checks each program on its own, without keeping it. Problems of the
   * project as a whole are refused at commit, not here.
   * @returns the problems found; one with severity error refuses the program.
   */
  check(programs: Program[]): Promise<Diagnostic[]>;
  /** The committed programs as one text. */
  exportText(): Promise<string>;
  /** Releases the backend. */
  close(): Promise<void>;
}

/** The changes of one write; they show at query or commit. */
export interface LogicTransaction {
  /** Adds the programs, replacing those with the same keys. */
  set(programs: Program[]): void;
  /** Removes the programs with these keys; an unknown key is ignored. */
  remove(keys: string[]): void;
  /** Replaces every program with these. */
  replaceAll(programs: Program[]): void;
  /** Solves `text` together with the transaction's programs. */
  query(text: string): Promise<QueryResult>;
  /**
   * Makes the changes the committed programs, or refuses them, for example
   * with kind `nonTotal` when they take the project's total answer away.
   * Ends the transaction either way.
   */
  commit(options?: CommitOptions): Promise<void>;
  /** Ends the transaction without committing it. */
  abort(): Promise<void>;
}

/**
 * One logic program, unique by key. Knowledge describes the project; query
 * programs only serve queries, and knowledge never reads what they define.
 */
export interface Program {
  key: string;
  role: 'knowledge' | 'query';
  text: string;
}

/** The answer to a query: its shown atoms, one per line; empty when there is none. */
export interface QueryResult {
  answers: string[];
}

/** A problem a backend found in a program or a query. */
export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  /** Key of the program the problem is in, when known. */
  key?: string;
}

export interface CommitOptions {
  /** Commit without refusing the result; for rebuilds from the files. */
  keepNonTotal?: boolean;
}

/** The opened checkout a backend serves. */
export interface LogicBackendOwner {
  /** Unique per opening of a checkout. */
  id: string;
  /** The project's prefix when opened; for logs only. */
  label: string;
  /**
   * Rebuilds every program from the project's files into the backend, once
   * the running operation has ended. Requests made before it starts share
   * it. Never rejects: a failed rebuild is logged.
   */
  resync(): Promise<void>;
}

/** Makes the backend of one opened checkout. */
export type LogicBackendFactory = (owner: LogicBackendOwner) => LogicBackend;

/**
 * Why a logic backend failed:
 * - invalid: a program or a query is wrong (see the diagnostics);
 * - nonTotal: the result has no single total answer (a sample of the
 *   undecided atoms in the diagnostics);
 * - unavailable: the backend cannot answer now, or lost its programs; the
 *   caller retries after the rebuild;
 * - internal: anything else.
 */
export type LogicErrorKind =
  'invalid' | 'nonTotal' | 'unavailable' | 'internal';

/** A failure of a logic backend, whichever backend it is. */
export class LogicError extends DomainError {
  readonly code = 'logic';

  constructor(
    public readonly kind: LogicErrorKind,
    message: string,
    public readonly diagnostics: Diagnostic[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LogicError';
    this.details = { kind, diagnostics };
  }

  /** The messages of the error diagnostics, or the error's own message. */
  get errors(): string[] {
    const errors = this.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => diagnostic.message);
    return errors.length > 0 ? errors : [this.message];
  }
}
