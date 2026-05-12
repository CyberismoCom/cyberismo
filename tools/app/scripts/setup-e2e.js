/* global console, process */
/**
 * Setup script for e2e tests.
 * Creates the test project before the backend starts, so that
 * CommandManager can eagerly initialize with the project path.
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tmpPath = join(import.meta.dirname, '..', '..', '..', '.tmp');
const batPath = join(tmpPath, 'cyberismo-bat');
const cli = `node ${join(import.meta.dirname, '..', '..', 'cli', 'bin', 'run')}`;

const graphModelPath = `${batPath}/.cards/local/graphModels/test1/model.lp`;
const graphViewPath = `${batPath}/.cards/local/graphViews/test1/view.lp.hbs`;
const reportPath = `${batPath}/.cards/local/reports/test1/query.lp.hbs`;

const graphModelContent =
  'view(Child) :- view(Parent), parent(Child, Parent).node(Card) :- card(Card), view(Card).attr(node, Card, "label", Title) :- node(Card), field(Card, "title", Title).attr(node, Card, "shape", "Box") :- node(Card).edge((Parent, Child)) :- parent(Child, Parent), view(Child), view(Parent).';
const graphViewContent = 'view({{cardKey}}).';
const reportContent =
  'selectAll.result(CardType) :-field(Card, "cardType", CardType).';

console.log('Setting up e2e test project...');

rmSync(batPath, {
  recursive: true,
  force: true,
  maxRetries: 3,
  retryDelay: 100,
});

if (!existsSync(tmpPath)) {
  mkdirSync(tmpPath, { recursive: true });
}

execSync(
  [
    `cd ${tmpPath}`,
    `${cli} create project "Basic Acceptance Test" bat cyberismo-bat --skipModuleImport`,
    'cd cyberismo-bat',
    `${cli} import module ../../module-test`,
    `${cli} create card test/templates/pageContent`,
    `${cli} create graphModel test1`,
    `${cli} create graphView test1`,
    `${cli} create report test1`,
    `${cli} create template page`,
    `${cli} create template checks`,
  ].join(' && '),
  { stdio: 'inherit' },
);

// Add a card to bat/templates/page and capture its generated key so the e2e
// test can navigate to it directly. A second sibling is added to the same
// template so the move dialog keeps the source's parent template visible
// (the dialog filters out empty templates when their only card is the
// source being moved).
const addCardOutput = execSync(
  `${cli} add card bat/templates/page test/cardTypes/page`,
  { cwd: batPath, encoding: 'utf8' },
);
process.stdout.write(addCardOutput);
const cardKeyMatch = addCardOutput.match(/bat_[a-z0-9]+/);
if (!cardKeyMatch) {
  throw new Error(
    `Could not parse template card key from CLI output: ${addCardOutput}`,
  );
}
const localTemplateCardKey = cardKeyMatch[0];
execSync(`${cli} add card bat/templates/page test/cardTypes/page`, {
  cwd: batPath,
  stdio: 'inherit',
});
execSync(`${cli} add card bat/templates/checks test/cardTypes/page`, {
  cwd: batPath,
  stdio: 'inherit',
});

writeFileSync(graphModelPath, graphModelContent);
writeFileSync(graphViewPath, graphViewContent);
writeFileSync(reportPath, reportContent);

writeFileSync(
  join(import.meta.dirname, '..', 'cypress', 'fixtures', 'e2e-keys.json'),
  JSON.stringify({ localTemplateCardKey }, null, 2),
);

console.log('E2e test project created successfully.');
