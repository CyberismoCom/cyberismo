/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { exec } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const tmpPath = '../../.tmp';
const moduleTestPath = '../../module-test';
const cliPath = `${tmpPath}/cyberismo-cli`;

let pageCardKey = '';
let decisionCardKey = '';
let newPageCardKey = '';

describe('Cli BAT test', function () {
  afterAll(() => {
    rmSync(cliPath, { recursive: true, force: true });
    return true;
  });
  beforeAll(() => {
    // Clean any leftover state from interrupted runs
    rmSync(cliPath, { recursive: true, force: true });
    mkdirSync(cliPath, { recursive: true });
  });
  it('Check version', async () => {
    await new Promise<void>((resolve) => {
      exec('cyberismo --version', (error, stdout, _stderr) => {
        expect(error).toBeNull();
        console.log(stdout);
        // Expect two lines: binary version and schema version
        const lines = stdout.trim().split('\n');
        expect(lines.length).toBe(2);
        // First line: cyberismo version: <int>.<int>.<int>
        const binaryVersionMatch = lines[0].match(
          /cyberismo version: (\d+\.\d+\.\d+)/,
        );
        expect(binaryVersionMatch).not.toBeNull();
        // Second line: Schema version: <int>
        const schemaVersionMatch = lines[1].match(/Schema version: (\d+)/);
        expect(schemaVersionMatch).not.toBeNull();
        resolve();
      });
    });
  });
  it('Validate test-module', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${moduleTestPath}&&cyberismo validate`,
        (error, stdout, _stderr) => {
          // If test is about to fail, show the all of the errors in the log.
          if (!stdout.includes('Project structure validated')) {
            console.log(stdout);
          }
          expect(error).toBeNull();
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create and validate new project', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${tmpPath}&&cyberismo create project "CLI Basic Acceptance Test" bat cyberismo-cli --skipModuleImport &&cd cyberismo-cli&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Import test-module', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cp -r ${moduleTestPath} module-test&&cyberismo import module ./module-test&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create a page', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create card test/templates/page&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Created cards');
          expect(stdout).toContain('Project structure validated');
          pageCardKey = stdout.substring(16, 28);
          resolve();
        },
      );
    });
  });
  it('Create a page as a child of the page', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create card test/templates/page ${pageCardKey}&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Created cards');
          expect(stdout).toContain('Project structure validated');
          decisionCardKey = stdout.substring(16, 28);
          resolve();
        },
      );
    });
  });
  it('Approve the page in its workflow', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo transition ${pageCardKey} Approve&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create a new workflow', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create workflow workflowTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create a new cardtype that uses the new workflow', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create cardType cardTypeTest bat/workflows/workflowTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create a new fieldtype', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create fieldType fieldTypeTest number&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create a new linktype', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create linkType linkTypeTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create a new template', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create template templateTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Add a card of the new cardtype to the newly created template', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo add card bat/templates/templateTest bat/cardTypes/cardTypeTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('was added to the template');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Create a card from the new template', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create card bat/templates/templateTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Created cards');
          expect(stdout).toContain('Project structure validated');
          newPageCardKey = stdout.substring(16, 28);
          resolve();
        },
      );
    });
  });
  it('Add an attachment to a card', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cp ../../tools/cli/test/cyberismo.png ./cyberismo.png&&cyberismo create attachment ${newPageCardKey} ./cyberismo.png&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Add a link (of the new linktype) between two cards', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo create link ${pageCardKey} ${newPageCardKey} bat/linkTypes/linkTypeTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Move a card', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo move ${decisionCardKey} ${newPageCardKey}&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Change the rank of a card', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo rank card ${pageCardKey} ${newPageCardKey}&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Export the static documentation site', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo export adoc ${newPageCardKey}&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Project structure validated');
          expect(stdout).toContain('Creating output file');
          resolve();
        },
      );
    });
  });
  it('Export a PDF document', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo export pdf ./test.pdf ${newPageCardKey} -r -t "Test Doc" -n "BAT" -d 2024-01-01 --doc-version 1.0.0 -m "Initial version"&&cyberismo validate`,
        (error, stdout, _stderr) => {
          // If test is about to fail, show the all of the errors in the log.
          if (!stdout.includes('Content exported as PDF to ./test.pdf')) {
            console.log(stdout);
          }
          expect(error).toBeNull();
          expect(stdout).toContain('Content exported as PDF to ./test.pdf');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  }, 60000);
  it('Export static site and preview it', async () => {
    const outputDir = 'out';
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath} && cyberismo export site ${outputDir} && cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Exported site to');
          expect(stdout).toContain(
            `Run 'cyberismo preview ${outputDir}' to view the site`,
          );
          expect(stdout).toContain('Project structure validated');
          rmSync(`${cliPath}/${outputDir}`, { recursive: true, force: true });
          resolve();
        },
      );
    });
  });
  it('Test calc run with tree query', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cp ../../tools/cli/test/tree.lp ./tree.lp&&cyberismo calc run ./tree.lp  &&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain(decisionCardKey);
          expect(stdout).toContain(pageCardKey);
          expect(stdout).toContain(newPageCardKey);
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Remove the attachment', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo remove attachment ${newPageCardKey} cyberismo.png&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Rename the project', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo rename cli&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          // Update card keys BEFORE calling resolve() to avoid race condition
          pageCardKey = pageCardKey.replace('bat', 'cli');
          decisionCardKey = decisionCardKey.replace('bat', 'cli');
          newPageCardKey = newPageCardKey.replace('bat', 'cli');
          resolve();
        },
      );
    });
  });
  it('Remove the link', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo remove link ${pageCardKey} ${newPageCardKey} cli/linkTypes/linkTypeTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Remove all cards of the new cardtype', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo remove card ${newPageCardKey}&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Remove the template', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo remove template cli/templates/templateTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Remove the cardtype', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo remove cardType cli/cardTypes/cardTypeTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Remove the workflow', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo remove workflow cli/workflows/workflowTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Remove the linktype', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo remove linkType cli/linkTypes/linkTypeTest&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Add default hub and remove it', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo add hub default &&cyberismo remove hub default&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
  it('Add default hub and check hub version', async () => {
    await new Promise<void>((resolve) => {
      exec(
        `cd ${cliPath}&&cyberismo add hub default&&cyberismo fetch hubs&&cyberismo validate`,
        (error, stdout, _stderr) => {
          expect(error).toBeNull();
          expect(stdout).toContain('Done');
          expect(stdout).toContain('Project structure validated');
          resolve();
        },
      );
    });
  });
}, 100000);
