// Concurrency stress test — run with: node test/concurrent.mjs
// Fires N concurrent solves across multiple ClingoContext instances to
// check for crashes or data races in the AST loading phase.

import { ClingoContext, clearCache } from '../dist/index.js';

const CONCURRENCY = 3000;
const ROUNDS = 5;

const programs = [
  'color(red). color(blue). color(green).',
  'num(1..10). even(X) :- num(X), X \\ 2 = 0.',
  'node(a;b;c;d). edge(a,b). edge(b,c). edge(c,d). path(X,Y) :- edge(X,Y). path(X,Z) :- path(X,Y), edge(Y,Z).',
  'fact(1). fact(2). fact(3). sum(S) :- S = #sum { X : fact(X) }.',
  ':- not a. a.',
];

async function runRound(round, preParsing) {
  clearCache();
  const tasks = Array.from({ length: CONCURRENCY }, (_, i) => {
    const ctx = new ClingoContext({ preParsing });
    const prog = programs[i % programs.length];
    return ctx.solve(prog);
  });

  const results = await Promise.all(tasks);
  const ok = results.every((r) => r.answers.length > 0);
  const label = preParsing ? 'pre-parsing' : 'parse_string';
  console.log(`Round ${round + 1}/${ROUNDS} [${label}]: ${CONCURRENCY} concurrent solves — ${ok ? 'OK' : 'FAILED'}`);
  if (!ok) process.exit(1);
}

const mode = process.argv[2] ?? 'both';

if (mode === 'parse_string' || mode === 'both') {
  for (let i = 0; i < ROUNDS; i++) {
    await runRound(i, false);
  }
}
if (mode === 'pre-parsing' || mode === 'both') {
  for (let i = 0; i < ROUNDS; i++) {
    await runRound(i, true);
  }
}
console.log('All rounds passed.');
