import { defineConfig } from 'cypress';
import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';

// Path for test project that is created and modified during tests
const batPath = '../../.tmp/cyberismo-bat';
const tmpPath = '../../.tmp';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on) {
      on('task', {
        deleteTestProject() {
          rmSync(batPath, { recursive: true, force: true });
          return true;
        },
        createTestProject() {
          if (existsSync(batPath)) {
            rmSync(batPath, { recursive: true, force: true });
          }
          if (!existsSync(tmpPath))  {
            mkdirSync(tmpPath, { recursive: true });
          }
          // Create test project from test-module
          execSync(
            'cd '+tmpPath+'&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat --skipModuleImport&&cd cyberismo-bat&&cyberismo import module ../../module-test&&cyberismo create card test/templates/pageContent',
          );
          return true;
        },
        writeGraph() {
          // Creates and edits graphModel, graphView and a report used for macros
          execSync(
            'cd '+batPath+'&&cyberismo create graphModel test1&&cyberismo create graphView test1&&cyberismo create report test1&&echo view(Child) :- view(Parent), parent(Child, Parent).node(Card) :- card(Card), view(Card).attr(node, Card, "label", Title) :- node(Card), field(Card, "title", Title).attr(node, Card, "shape", "Box") :- node(Card).edge((Parent, Child)) :- parent(Child, Parent), view(Child), view(Parent). > .cards/local/graphModels/test1/model.lp&&echo view({{cardKey}}). > .cards/local/graphViews/test1/view.lp.hbs&&echo selectAll.result(CardType) :-field(Card, "cardType", CardType). > .cards/local/reports/test1/query.lp.hbs',
          );
          return true;
        },
      });
    },
  },
});
