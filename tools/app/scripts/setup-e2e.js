/* global console */
/**
 * Setup script for e2e tests.
 * Creates the test project before the backend starts, so that
 * CommandManager can eagerly initialize with the project path.
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpPath = resolve(__dirname, '../../../.tmp');
const batPath = resolve(tmpPath, 'cyberismo-bat');

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
    'cyberismo create project "Basic Acceptance Test" bat cyberismo-bat --skipModuleImport',
    'cd cyberismo-bat',
    'cyberismo import module ../../module-test',
    'cyberismo create card test/templates/pageContent',
    'cyberismo create graphModel test1',
    'cyberismo create graphView test1',
    'cyberismo create report test1',
  ].join(' && '),
  { stdio: 'inherit' },
);

writeFileSync(graphModelPath, graphModelContent);
writeFileSync(graphViewPath, graphViewContent);
writeFileSync(reportPath, reportContent);

console.log('E2e test project created successfully.');
