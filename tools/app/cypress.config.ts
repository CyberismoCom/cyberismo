import { defineConfig } from 'cypress';
import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Cypress runs this config as CJS, so __dirname is available (not import.meta.dirname).
const cli = `node ${join(__dirname, '..', 'cli', 'bin', 'run')}`;

// Path for test project that is created and modified during tests
const batPath = '../../.tmp/cyberismo-bat';
const tmpPath = '../../.tmp';
// paths to files used in macros
const graphModelPath = `${batPath}/.cards/local/graphModels/test1/model.lp`;
const graphViewPath = `${batPath}/.cards/local/graphViews/test1/view.lp.hbs`;
const reportPath = `${batPath}/.cards/local/reports/test1/query.lp.hbs`;

// commands used to create test project
const cd = `cd ${tmpPath}`;
const createProject = `${cli} create project "Basic Acceptance Test" bat cyberismo-bat --skipModuleImport`;
const cdProject = 'cd cyberismo-bat';
const importModule = `${cli} import module ../../module-test`;
const createCardPageContent = `${cli} create card test/templates/pageContent`;
const createGraphModel = `${cli} create graphModel test1`;
const createGraphView = `${cli} create graphView test1`;
const createReport = `${cli} create report test1`;
// content for files used in macros
const graphModelContent =
  'view(Child) :- view(Parent), parent(Child, Parent).node(Card) :- card(Card), view(Card).attr(node, Card, "label", Title) :- node(Card), field(Card, "title", Title).attr(node, Card, "shape", "Box") :- node(Card).edge((Parent, Child)) :- parent(Child, Parent), view(Child), view(Parent).';
const graphViewContent = 'view({{cardKey}}).';
const reportContent =
  'selectAll.result(CardType) :-field(Card, "cardType", CardType).';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    experimentalMemoryManagement: true,
    taskTimeout: 120000,
    setupNodeEvents(on) {
      on('task', {
        deleteTestProject() {
          rmSync(batPath, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          });
          return null; // Return null instead of true to prevent EPIPE errors
        },
        createTestProject() {
          rmSync(batPath, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          });
          if (!existsSync(tmpPath)) {
            mkdirSync(tmpPath, { recursive: true });
          }
          // Create test project from test-module with graphModel, graphView and a report used for macros
          if (!existsSync(batPath)) {
            execSync(
              `${cd}&&${createProject}&&${cdProject}&&${importModule}&&${createCardPageContent}&&${createGraphModel}&&${createGraphView}&&${createReport}`,
            );
            writeFileSync(graphModelPath, graphModelContent);
            writeFileSync(graphViewPath, graphViewContent);
            writeFileSync(reportPath, reportContent);
          }
          return true;
        },
      });
    },
  },
});
