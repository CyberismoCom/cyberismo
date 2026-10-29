// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// The CLI's contract core: exact stdout, stderr and exit code of the built
// binary for a small set of stable commands.

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { describe, expect, it } from 'vitest';

import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';

const bin = join(import.meta.dirname, '..', 'bin', 'run');
type Transcript = { code: number; stdout: string; stderr: string };

let project: BuiltProject;
let paths: string[];
// Card key → <cardN>, seeded with the fixture's keys, then by first appearance.
let keys: Map<string, string>;

async function useFixture() {
  project = await buildProject({
    templates: [{ name: 'page', cards: [{ title: 'Template page' }] }],
    cards: [
      { title: 'Alpha', children: [{ title: 'Child' }] },
      { title: 'Beta' },
    ],
  });
  paths = longestFirst(project.path, realpathSync.native(project.path));
  keys = new Map(project.keys.map((key, i) => [key, `<card${i + 1}>`]));
}

// A path that is a suffix of another (a symlinked tmpdir) must go last.
const longestFirst = (...all: string[]) =>
  [...new Set(all)].sort((a, b) => b.length - a.length);

// Replaces card keys, project paths, timestamps and versions.
function normalise(text: string): string {
  for (const path of paths) {
    text = text
      .replaceAll(JSON.stringify(path).slice(1, -1), '<project>')
      .replaceAll(path, '<project>');
  }
  return text
    .replace(/<project>[^\s"']*/g, (path) => path.replace(/\\+/g, '/'))
    .replace(/\btest_[0-9a-z]{8}\b/g, (key) => {
      if (!keys.has(key)) keys.set(key, `<card${keys.size + 1}>`);
      return keys.get(key)!;
    })
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<timestamp>')
    .replace(/(version: )\S+/g, '$1<version>');
}

function spawn(cwd: string, args: string[]): Promise<Transcript> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [bin, ...args],
      { cwd, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined } },
      (error, stdout, stderr) => {
        const code = error ? (error.signal ? -1 : Number(error.code)) : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

// Runs the CLI in the project; cards are referred to by their placeholder.
async function cli(...args: string[]): Promise<Transcript> {
  const real = args.map(
    (arg) => [...keys].find(([, name]) => name === arg)?.[0] ?? arg,
  );
  const { code, stdout, stderr } = await spawn(project.path, real);
  return { code, stdout: normalise(stdout), stderr: normalise(stderr) };
}

const ok = (stdout: string) => ({ code: 0, stdout, stderr: '' });
const fail = (stderr: string) => ({ code: 1, stdout: '', stderr });
const missing = fail("Card 'test_nope' does not exist in the project\n");

async function card(key: string) {
  return JSON.parse((await cli('show', 'card', key)).stdout);
}

describe('CLI transcripts', { timeout: 30000 }, () => {
  describe('read-only', () => {
    beforeAll(useFixture);
    afterAll(() => project.cleanup());

    it('--version', async () => {
      expect(await cli('--version')).toEqual(
        ok('cyberismo version: <version>\nSchema version: <version>\n'),
      );
      expect(await cli('--bogus')).toEqual(
        fail("error: unknown option '--bogus'\n"),
      );
    });

    it('normalises a symlinked project path', () => {
      const [saved, real] = [paths, `/private${project.path}`];
      paths = longestFirst(project.path, real);
      expect(normalise(`${real}/x`)).toBe('<project>/x');
      paths = saved;
    });

    // Checked-in file, not a snapshot, so `vitest -u` cannot rewrite it.
    it('--help', async () => {
      let help = '';
      for (const cmd of [[], ['create'], ['show'], ['remove']]) {
        const out = await cli(...cmd, '--help');
        expect({ ...out, stdout: '' }).toEqual(ok(''));
        help += `$ cyberismo ${[...cmd, '--help'].join(' ')}\n${out.stdout}\n`;
      }
      const file = await readFile(
        join(import.meta.dirname, 'help.txt'),
        'utf-8',
      );
      expect(help).toBe(file.replaceAll('\r\n', '\n'));
      expect(await cli('bogus')).toEqual(
        fail("error: unknown command 'bogus'\n"),
      );
    });

    it('show project', async () => {
      const shown = ok(`{
  "name": "test",
  "path": "<project>",
  "prefix": "test",
  "description": "",
  "hubs": [],
  "modules": [],
  "numberOfCards": 3
}
`);
      expect(await cli('show', 'project')).toEqual(shown);
      const outside = await mkdtemp(join(tmpdir(), 'cyberismo-outside-'));
      try {
        expect(await spawn(outside, ['show', 'project'])).toEqual(
          fail(
            'No path defined with "-p" flag and could not find project. Sorry.\n',
          ),
        );
        const viaFlag = await spawn(outside, [
          'show',
          'project',
          '-p',
          project.path,
        ]);
        expect({ ...viaFlag, stdout: normalise(viaFlag.stdout) }).toEqual(
          shown,
        );
        expect(await spawn(outside, ['show', 'project', '-p', 'nope'])).toEqual(
          fail("Input validation error: folder name 'nope' is invalid\n"),
        );
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('show card', async () => {
      expect(await cli('show', 'card', '<card1>')).toEqual(
        ok(`{
  "key": "<card1>",
  "path": "<project>/cardRoot/<card1>",
  "children": [
    "<card2>"
  ],
  "parent": "root",
  "metadata": {
    "cardType": "test/cardTypes/page",
    "title": "Alpha",
    "workflowState": "Open",
    "rank": "0|a",
    "lastUpdated": "<timestamp>",
    "labels": [],
    "links": []
  },
  "attachments": []
}
`),
      );
      expect(await cli('show', 'card', 'test_nope')).toEqual(missing);
    });

    it('show cardTypes', async () => {
      expect(await cli('show', 'cardTypes')).toEqual(
        ok('[\n  "test/cardTypes/page"\n]\n'),
      );
      expect(await cli('show', 'cardType', 'test/cardTypes/nope')).toEqual(
        fail("CardType 'test/cardTypes/nope' does not exist in the project\n"),
      );
    });

    it('validate', async () => {
      expect(await cli('validate')).toEqual(
        ok('Project structure validated\n'),
      );
    });
  });

  describe('mutating', () => {
    beforeEach(useFixture);
    afterEach(() => project.cleanup());

    it('create card', async () => {
      const template = 'test/templates/page';
      expect(await cli('create', 'card', template, '<card1>')).toEqual(
        ok('Created cards ["<card4>"]\n'),
      );
      const created = await card('<card4>');
      expect(created.parent).toBe('<card1>');
      expect(created.metadata.title).toBe('Template page');
      expect(await cli('create', 'card', template, 'test_nope')).toEqual(
        missing,
      );
    });

    it('move', async () => {
      expect(await cli('move', '<card2>', 'root')).toEqual(ok('Done\n'));
      expect((await card('<card2>')).parent).toBe('root');
      expect(await cli('move', '<card3>', 'test_nope')).toEqual(missing);
    });

    it('rank', async () => {
      expect(await cli('rank', 'card', '<card3>', 'first')).toEqual(
        ok('Done\n'),
      );
      const [first, second] = [await card('<card3>'), await card('<card1>')];
      expect(first.metadata.rank < second.metadata.rank).toBe(true);
      expect(await cli('rank', 'card', '<card3>', 'test_nope')).toEqual(
        missing,
      );
    });

    it('transition', async () => {
      expect(await cli('transition', '<card1>', 'To Closed')).toEqual(
        ok('Done\n'),
      );
      expect((await card('<card1>')).metadata.workflowState).toBe('Closed');
      expect(await cli('transition', '<card1>', 'Bogus')).toEqual(
        fail(
          "Card's workflow 'test/workflows/default' does not contain state transition 'Bogus'.\n" +
            ' '.repeat(26) +
            '\nThe available transitions are: Create, To In Progress, To Closed\n',
        ),
      );
    });

    it('remove', async () => {
      expect(await cli('remove', 'card', '<card3>')).toEqual(ok('Done\n'));
      expect(await cli('show', 'card', '<card3>')).toEqual(
        fail("Card '<card3>' does not exist in the project\n"),
      );
      expect(await cli('remove', 'card', 'test_nope')).toEqual(missing);
    });

    it('export adoc', async () => {
      expect(await cli('export', 'adoc', 'out')).toEqual(
        ok(`Creating output file '${join('out', 'index.adoc')}'\n`),
      );
      expect(await cli('export', 'adoc', 'out', '<card1>')).toEqual(
        ok(`Using existing output file '${join('out', 'index.adoc')}'\n`),
      );
      const document = await readFile(
        join(project.path, 'out', 'index.adoc'),
        'utf-8',
      );
      expect(document).toMatch(/^:imagesdir: \.\/a\/\n== Alpha\n/);
      expect(document).not.toContain('== Beta');
      expect((await stat(join(project.path, 'out', 'a'))).isDirectory()).toBe(
        true,
      );
      expect(await cli('export', 'adoc', 'out', 'test_nope')).toEqual(missing);
    });

    // A stub asciidoctor-pdf that echoes its AsciiDoc source as the "PDF", or
    // fails with a server path in its diagnostics.
    it.runIf(process.platform === 'linux')('export pdf', async () => {
      const binDir = await mkdtemp(join(tmpdir(), 'cyberismo-pdf-stub-'));
      const stub = (script: string) =>
        writeFile(join(binDir, 'asciidoctor-pdf'), `#!/bin/sh\n${script}`, {
          mode: 0o755,
        });
      const originalPath = process.env.PATH;
      process.env.PATH = `${binDir}:${originalPath}`;
      try {
        await stub('cat\n');
        expect(await cli('export', 'pdf', 'out.pdf', '<card1>')).toEqual(
          ok('Content exported as PDF to out.pdf\n'),
        );
        const source = await readFile(join(project.path, 'out.pdf'), 'utf-8');
        expect(source).toMatch(/^= Title\nName\n/);
        expect(source).toContain(':revremark: Initial version\n');

        await stub(
          'cat > /dev/null\necho "asciidoctor: ERROR: /srv/secret/path" >&2\nexit 1\n',
        );
        expect(await cli('export', 'pdf', 'out.pdf', '<card1>')).toEqual(
          fail(
            'Asciidoctor-pdf failed with code 1\nasciidoctor: ERROR: /srv/secret/path\n',
          ),
        );
      } finally {
        process.env.PATH = originalPath;
        await rm(binDir, { recursive: true, force: true });
      }
    });

    it('calc generate', async () => {
      expect(await cli('calc', 'generate', 'all.lp')).toEqual(ok('Done\n'));
      expect(await cli('calc', 'generate', 'tree.lp', 'tree')).toEqual(
        ok('Done\n'),
      );
      const program = (file: string) =>
        readFile(join(project.path, file), 'utf-8');
      expect((await program('tree.lp')).endsWith(await program('all.lp'))).toBe(
        true,
      );
      expect(await cli('calc', 'generate', 'x.lp', 'bogus')).toEqual(
        fail(
          "Unknown query 'bogus'. Must be one of: card, connectors, enabledSkills, onCreation, onTransition, tree\n",
        ),
      );
    });

    it('report', async () => {
      expect(await cli('create', 'report', 'children')).toEqual(ok('Done\n'));
      const parameters = (value: object) =>
        writeFile(join(project.path, 'report.json'), JSON.stringify(value));
      await parameters({
        name: 'test/reports/children',
        parameters: { cardKey: project.keys[0] },
      });
      const report = await cli('report', 'report.json');
      expect({
        ...report,
        stdout: report.stdout.replaceAll('\r\n', '\n'),
      }).toEqual(ok('* Child\n\n'));
      expect(await cli('report', 'report.json', 'out.txt')).toEqual(
        ok('Done\n'),
      );
      const written = await readFile(join(project.path, 'out.txt'), 'utf-8');
      expect(written.replaceAll('\r\n', '\n')).toBe('* Child\n');

      await parameters({
        name: 'test/reports/children',
        parameters: { cardKey: project.keys[2] },
      });
      expect(await cli('report', 'report.json')).toEqual(
        ok('No report results\n'),
      );
      await parameters({ name: 'test/reports/children', parameters: {} });
      expect(await cli('report', 'report.json')).toEqual(
        fail(
          'The parameters file must include a "cardKey" field included in the "parameters".\n',
        ),
      );
    });

    it('validate an invalid project', async () => {
      const file = join(
        project.path,
        'cardRoot',
        project.keys[2],
        'index.json',
      );
      const index = JSON.parse(await readFile(file, 'utf-8'));
      await writeFile(
        file,
        JSON.stringify({ ...index, cardType: 'test/cardTypes/missing' }),
      );
      // Validation findings go to stdout with exit code 0 until V3 changes it.
      expect(await cli('validate')).toEqual(
        ok("Card '<card3>' has invalid card type 'test/cardTypes/missing'\n"),
      );
    });
  });
});
