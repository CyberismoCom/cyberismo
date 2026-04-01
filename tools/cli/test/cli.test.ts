import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const execAsync = promisify(exec);

// CLI command to use. Defaults to running bin/run directly (no global install needed).
// Override with CLI_COMMAND=cyberismo for Docker CI (scripts/cyberismo wrapper).
const cli = process.env.CLI_COMMAND || `node ${resolve('bin/run')}`;

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
    const { stdout } = await execAsync(`${cli} --version`);
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
  });
  it('Validate test-module', async () => {
    const { stdout } = await execAsync(
      `cd ${moduleTestPath} && ${cli} validate`,
    );
    // If test is about to fail, show the all of the errors in the log.
    if (!stdout.includes('Project structure validated')) {
      console.log(stdout);
    }
    expect(stdout).toContain('Project structure validated');
  });
  it('Create and validate new project', async () => {
    const { stdout } = await execAsync(
      `cd ${tmpPath} && ${cli} create project "CLI Basic Acceptance Test" bat cyberismo-cli --skipModuleImport && cd cyberismo-cli && ${cli} validate`,
    );
    expect(stdout).toContain('Project structure validated');
  });
  it('Import test-module', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && cp -r ${moduleTestPath} module-test && ${cli} import module ./module-test && ${cli} validate`,
    );
    expect(stdout).toContain('Project structure validated');
  });
  it('Create a page', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create card test/templates/page && ${cli} validate`,
    );
    expect(stdout).toContain('Created cards');
    expect(stdout).toContain('Project structure validated');
    pageCardKey = stdout.substring(16, 28);
  });
  it('Create a page as a child of the page', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create card test/templates/page ${pageCardKey} && ${cli} validate`,
    );
    expect(stdout).toContain('Created cards');
    expect(stdout).toContain('Project structure validated');
    decisionCardKey = stdout.substring(16, 28);
  });
  it('Approve the page in its workflow', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} transition ${pageCardKey} Approve && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Create a new workflow', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create workflow workflowTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Create a new cardtype that uses the new workflow', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create cardType cardTypeTest bat/workflows/workflowTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Create a new fieldtype', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create fieldType fieldTypeTest number && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Create a new linktype', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create linkType linkTypeTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Create a new template', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create template templateTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Add a card of the new cardtype to the newly created template', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} add card bat/templates/templateTest bat/cardTypes/cardTypeTest && ${cli} validate`,
    );
    expect(stdout).toContain('was added to the template');
    expect(stdout).toContain('Project structure validated');
  });
  it('Create a card from the new template', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create card bat/templates/templateTest && ${cli} validate`,
    );
    expect(stdout).toContain('Created cards');
    expect(stdout).toContain('Project structure validated');
    newPageCardKey = stdout.substring(16, 28);
  });
  it('Add an attachment to a card', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && cp ../../tools/cli/test/cyberismo.png ./cyberismo.png && ${cli} create attachment ${newPageCardKey} ./cyberismo.png && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Add a link (of the new linktype) between two cards', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} create link ${pageCardKey} ${newPageCardKey} bat/linkTypes/linkTypeTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Move a card', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} move ${decisionCardKey} ${newPageCardKey} && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Change the rank of a card', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} rank card ${pageCardKey} ${newPageCardKey} && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Export the static documentation site', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} export adoc ${newPageCardKey} && ${cli} validate`,
    );
    expect(stdout).toContain('Project structure validated');
    expect(stdout).toContain('Creating output file');
  });
  it('Export a PDF document', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} export pdf ./test.pdf ${newPageCardKey} -r -t "Test Doc" -n "BAT" -d 2024-01-01 --doc-version 1.0.0 -m "Initial version" && ${cli} validate`,
    );
    // If test is about to fail, show the all of the errors in the log.
    if (!stdout.includes('Content exported as PDF to ./test.pdf')) {
      console.log(stdout);
    }
    expect(stdout).toContain('Content exported as PDF to ./test.pdf');
    expect(stdout).toContain('Project structure validated');
  });
  it('Export static site and preview it', async () => {
    const outputDir = 'out';
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} export site ${outputDir} && ${cli} validate`,
    );
    expect(stdout).toContain('Exported site to');
    expect(stdout).toContain(
      `Run 'cyberismo preview ${outputDir}' to view the site`,
    );
    expect(stdout).toContain('Project structure validated');
    rmSync(`${cliPath}/${outputDir}`, { recursive: true, force: true });
  });
  it('Test calc run with tree query', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && cp ../../tools/cli/test/tree.lp ./tree.lp && ${cli} calc run ./tree.lp && ${cli} validate`,
    );
    expect(stdout).toContain(decisionCardKey);
    expect(stdout).toContain(pageCardKey);
    expect(stdout).toContain(newPageCardKey);
    expect(stdout).toContain('Project structure validated');
  });
  it('Remove the attachment', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} remove attachment ${newPageCardKey} cyberismo.png && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Rename the project', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} rename cli && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
    pageCardKey = pageCardKey.replace('bat', 'cli');
    decisionCardKey = decisionCardKey.replace('bat', 'cli');
    newPageCardKey = newPageCardKey.replace('bat', 'cli');
  });
  it('Remove the link', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} remove link ${pageCardKey} ${newPageCardKey} cli/linkTypes/linkTypeTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Remove all cards of the new cardtype', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} remove card ${newPageCardKey} && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Remove the template', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} remove template cli/templates/templateTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Remove the cardtype', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} remove cardType cli/cardTypes/cardTypeTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Remove the workflow', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} remove workflow cli/workflows/workflowTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Remove the linktype', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} remove linkType cli/linkTypes/linkTypeTest && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Add default hub and remove it', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} add hub default && ${cli} remove hub default && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
  it('Add default hub and check hub version', async () => {
    const { stdout } = await execAsync(
      `cd ${cliPath} && ${cli} add hub default && ${cli} fetch hubs && ${cli} validate`,
    );
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Project structure validated');
  });
});
