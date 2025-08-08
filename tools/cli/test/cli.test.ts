/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { exec, execSync } from 'child_process';
import { log } from 'console';
import { existsSync, rmSync } from 'fs';

const baseModulePath = '../../.tmp/module-base';
const cliPath = '../../.tmp/cyberismo-cli';

let pageCardKey = '';
let decisionCardKey = '';
let newPageCardKey = '';

use(chaiAsPromised);

describe('Cli BAT test', function () {
  this.timeout(20000);
  before(() => {
    console.log('Starting CLI acceptance test');
    // Cloning is only needed for local development.
    if (!process.env.GITHUB_ACTIONS) {
      if (existsSync(baseModulePath)) {
        // Always clone the repo.
        rmSync(baseModulePath, { recursive: true, force: true });
      }
      if (!existsSync(baseModulePath)) {
        // temp clone to a feature branch
        execSync(
          'cd ../../&&git clone -b main git@github.com:CyberismoCom/module-base.git .tmp/module-base',
        );
      }
    }
  });
  after(() => {
    rmSync(cliPath, { recursive: true, force: true });
    return true;
  });
  it('validate module-base', function (done) {
    exec(
      'cd ../../.tmp/module-base&&cyberismo validate ',
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        // If test is about to fail, show the all of the errors in the log.
        if (!stdout.includes('Project structure validated')) {
          log(stdout);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create and validate new project', function (done) {
    exec(
      'cd ../../.tmp&&cyberismo create project "CLI Basic Acceptance Test" bat cyberismo-cli&&cd cyberismo-cli&&cyberismo validate',
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Import module-base', function (done) {
    // temp use feature branch to make the tests pass
    exec(
      'cd ../../.tmp/cyberismo-cli&&cyberismo import module https://github.com/CyberismoCom/module-base.git main&&cyberismo validate',
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create a page', function (done) {
    exec(
      'cd ../../.tmp/cyberismo-cli&&cyberismo create card base/templates/page&&cyberismo validate',
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Created cards');
        expect(stdout).to.include('Project structure validated');
        done();
        return (pageCardKey = stdout.substring(16, 28));
      },
    );
  });
  it('Create a decision as a child of the page', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create card base/templates/decision ${pageCardKey}&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Created cards');
        expect(stdout).to.include('Project structure validated');
        done();
        return (decisionCardKey = stdout.substring(16, 28));
      },
    );
  });
  it('Approve the decision in its workflow', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo transition ${decisionCardKey} Approve&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create a new workflow', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create workflow workflowTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create a new cardtype that uses the new workflow', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create cardType cardTypeTest bat/workflows/workflowTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create a new fieldtype', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create fieldType fieldTypeTest number&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create a new linktype', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create linkType linkTypeTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create a new template', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create template templateTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Add a card of the new cardtype to the newly created template', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo add bat/templates/templateTest bat/cardTypes/cardTypeTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('was added to the template');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Create a card from the new template', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create card bat/templates/templateTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Created cards');
        expect(stdout).to.include('Project structure validated');
        done();
        return (newPageCardKey = stdout.substring(16, 28));
      },
    );
  });
  it('Add an attachment to a card', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cp ../../tools/cli/test/cyberismo.png ./cyberismo.png&&cyberismo create attachment ${newPageCardKey} ./cyberismo.png&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Add a link (of the new linktype) between two cards', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo create link ${pageCardKey} ${newPageCardKey} bat/linkTypes/linkTypeTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Move a card', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo move ${decisionCardKey} ${newPageCardKey}&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Change the rank of a card', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo rank card ${pageCardKey} ${newPageCardKey}&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Export the static documentation site', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo export adoc ${newPageCardKey}&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Project structure validated');
        expect(stdout).to.include('Creating output file');
        done();
      },
    );
  });
  it('Export a PDF document', function (done) {
    this.timeout(60000);
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo export pdf ./test.pdf ${newPageCardKey} -r -t "Test Doc" -n "BAT" -d 2024-01-01 -v 1.0.0 -m "Initial version"&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        // If test is about to fail, show the all of the errors in the log.
        if (!stdout.includes('Exported PDF to ./test.pdf')) {
          log(stdout);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Exported PDF to ./test.pdf');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('export static site and preview it', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo export site ./out&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Exported site to');
        expect(stdout).to.include(
          'Run `cyberismo preview out` to view the site',
        );
        expect(stdout).to.include('Project structure validated');
        rmSync('./out', { recursive: true, force: true });
        done();
      },
    );
  });
  it('Test calc run with tree query', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cp ../../tools/assets/src/calculations/queries/tree.lp ./tree.lp&&cyberismo calc run ./tree.lp &&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include(decisionCardKey);
        expect(stdout).to.include(pageCardKey);
        expect(stdout).to.include(newPageCardKey);
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Remove the attachment', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo remove attachment ${newPageCardKey} cyberismo.png&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Rename the project', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo rename cli&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
        return (
          (pageCardKey = pageCardKey.replace('bat', 'cli')),
          (decisionCardKey = decisionCardKey.replace('bat', 'cli')),
          (newPageCardKey = newPageCardKey.replace('bat', 'cli'))
        );
      },
    );
  });
  it('Remove the link', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo remove link ${pageCardKey} ${newPageCardKey} cli/linkTypes/linkTypeTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Remove all cards of the new cardtype', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo remove card ${newPageCardKey}&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Remove the template', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo remove template cli/templates/templateTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Remove the cardtype', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo remove cardType cli/cardTypes/cardTypeTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Remove the workflow', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo remove workflow cli/workflows/workflowTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
  it('Remove the linktype', function (done) {
    exec(
      `cd ../../.tmp/cyberismo-cli&&cyberismo remove linkType cli/linkTypes/linkTypeTest&&cyberismo validate`,
      (error, stdout, _stderr) => {
        if (error != null) {
          log(error);
        }
        expect(error).to.be.null;
        expect(stdout).to.include('Done');
        expect(stdout).to.include('Project structure validated');
        done();
      },
    );
  });
});
