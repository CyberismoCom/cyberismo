import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalSetup() {
  const scriptDir = import.meta.dirname;
  const setupScript = join(scriptDir, '..', 'scripts', 'setup-e2e.js');
  if (!existsSync(setupScript)) {
    throw new Error(`setup-e2e.js not found at ${setupScript}`);
  }
  execSync(`node ${setupScript}`, { stdio: 'inherit' });
}
