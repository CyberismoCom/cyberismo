import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { GitSourceLayer } from '../../src/modules/source-git.js';
import { FileSourceLayer } from '../../src/modules/source-file.js';

async function layoutModule(root: string, cfg: object, seals: Array<[string, string]>) {
  const local = join(root, '.cards', 'local');
  await mkdir(join(local, 'migrations'), { recursive: true });
  await writeFile(join(local, 'cardsConfig.json'), JSON.stringify(cfg));
  for (const [f, t] of seals)
    await writeFile(join(local, 'migrations', `migrationLog_${f}_${t}.jsonl`), '');
}

describe('SourceLayer.readMetadata', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'meta-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('git: returns config + seals from a tag without a full checkout', async () => {
    const repo = join(dir, 'repo');
    await layoutModule(repo, { cardKeyPrefix: 'A', version: '1.0.0',
      modules: [{ name: 'B', location: 'x/B', version: '^1.0.0' }] }, [['0.9.0', '1.0.0']]);
    const git = simpleGit(repo);
    await git.init().add('.').commit('init');
    await git.addTag('v1.0.0');

    const layer = new GitSourceLayer();
    const out = await layer.readMetadata({ location: repo }, '1.0.0' as never, repo);
    expect(out.config.modules?.[0].name).toBe('B');
    expect(out.seals.map((s) => s.fileName)).toContain('migrationLog_0.9.0_1.0.0.jsonl');
    await layer.dispose();
  });

  it('file: reads config + seals from the source dir', async () => {
    const src = join(dir, 'src');
    await layoutModule(src, { cardKeyPrefix: 'A', name: 'A', modules: [] }, [['1.0.0', '1.1.0']]);
    const out = await new FileSourceLayer().readMetadata({ location: `file:${src}` }, '1.1.0' as never);
    expect(out.seals).toHaveLength(1);
  });
});
