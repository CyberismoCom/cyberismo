/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { exec, execSync } from 'child_process';
import { log } from 'console';
import { existsSync, rmSync } from 'fs';

const baseModulePath = '../../module-base';
const docsPath = '../../cyberismo-docs';
const cliPath = '../../cyberismo-cli';
let pageCardKey = '';
let decisionCardKey = '';
let newPageCardKey = '';

use(chaiAsPromised);

describe('Cli BAT test', function () {
  this.timeout(20000);
  before(() => {
    if (!existsSync(baseModulePath)) {
      execSync(
        'cd ../../&&git clone git@github.com:CyberismoCom/module-base.git',
      );
    }
    if (!existsSync(docsPath)) {
      execSync(
        'cd ../../&&git clone git@github.com:CyberismoCom/cyberismo-docs.git',
      );
    }
  });
  after(() => {
    rmSync(baseModulePath, { recursive: true, force: true });
    rmSync(docsPath, { recursive: true, force: true });
    rmSync(cliPath, { recursive: true, force: true });
    return true;
  });
  it('validate module-base', function (done) {
    exec(
      'cd ../../module-base&&cyberismo validate ',
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
  it('validate cyberismo-docs', function (done) {
    exec(
      'cd ../../cyberismo-docs&&cyberismo validate ',
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
  it('Create and validate new project', function (done) {
    exec(
      'cd ../../&&cyberismo create project "CLI Basic Acceptance Test" bat cyberismo-cli&&cd cyberismo-cli&&cyberismo validate',
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
    exec(
      'cd ../../cyberismo-cli&&cyberismo import module ../module-base&&cyberismo validate',
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
      'cd ../../cyberismo-cli&&cyberismo create card base/templates/page&&cyberismo validate',
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
      `cd ../../cyberismo-cli&&cyberismo create card base/templates/decision ${pageCardKey}&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo transition ${decisionCardKey} Approve&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo create workflow workflowTest&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo create cardType cardTypeTest workflowTest&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo create fieldType fieldTypeTest number&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo create linkType linkTypeTest&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo create template templateTest&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo add base/templates/templateTest bat/cardTypes/cardTypeTest&&cyberismo validate`,
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
  it('Create a card from the new cardtype', function (done) {
    exec(
      `cd ../../cyberismo-cli&&cyberismo create card bat/templates/templateTest&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo create attachment ${newPageCardKey} ../tools/cli/test/cyberismo.png&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo create link ${pageCardKey} ${newPageCardKey} bat/linkTypes/linkTypeTest&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo move ${decisionCardKey} ${newPageCardKey}&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo rank card ${pageCardKey} ${newPageCardKey}&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo export adoc ${newPageCardKey}&&cyberismo validate`,
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
  it('Generate calculations', function (done) {
    exec(
      `cd ../../cyberismo-cli&&cyberismo calc generate&&cyberismo validate`,
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
  it('Remove the attachment', function (done) {
    exec(
      `cd ../../cyberismo-cli&&cyberismo remove attachment ${newPageCardKey} cyberismo.png&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo rename cli&&cyberismo validate`,
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
  //  INTDEV-601
  //  it('Remove the link', function (done) {
  //    exec(`cd ../../cyberismo-cli&&cyberismo remove link ${pageCardKey} ${newPageCardKey} cli/linkTypes/linkTypeTest&&cyberismo validate`, (error, stdout, _stderr) => {
  //    if (error != null) {log(error);}
  //      log(error);
  //      log(stdout);
  //      expect(error).to.be.null;
  //      expect(stdout).to.include('Done');
  //      expect(stdout).to.include('Project structure validated');
  //      done();
  //    });
  //  });
  it('Remove all cards of the new cardtype', function (done) {
    exec(
      `cd ../../cyberismo-cli&&cyberismo remove card ${newPageCardKey}&&cyberismo validate`,
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
      `cd ../../cyberismo-cli&&cyberismo remove template cli/templates/templateTest&&cyberismo validate`,
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
  //  INTDEV-602
  //  it('Remove the cardtype', function (done) {
  //    exec(`cd ../../cyberismo-cli&&cyberismo remove cardtype cli/cardTypes/cardTypeTest&&cyberismo validate`, (error, stdout, _stderr) => {
  //      if (error != null) {log(error);}
  //      expect(error).to.be.null;
  //      expect(stdout).to.include('Done');
  //      expect(stdout).to.include('Project structure validated');
  //      done();
  //    });
  //  });
  //  INTDEV-602
  //  it('Remove the workflow', function (done) {
  //    exec(`cd ../../cyberismo-cli&&cyberismo remove workflow workflowTest&&cyberismo validate`, (error, stdout, _stderr) => {
  //      if (error != null) {log(error);}
  //      expect(error).to.be.null;
  //      expect(stdout).to.include('Done');
  //      expect(stdout).to.include('Project structure validated');
  //      done();
  //    });
  //  });
  it('Remove the linktype', function (done) {
    exec(
      `cd ../../cyberismo-cli&&cyberismo remove linkType cli/linkTypes/linkTypeTest&&cyberismo validate`,
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
