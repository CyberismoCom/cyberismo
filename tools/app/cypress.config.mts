import { defineConfig } from 'cypress';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

// Path for test project that is created and modified during tests
const batPath = '../../.tmp/cyberismo-bat';
// Path for module-base content repo, which is cloned in Github actions on CI and in createTestProject when running locally
const baseModulePath = '../../.tmp/module-base';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    setupNodeEvents(on, config) {
      on('task', {
        deleteTestProject() {
          rmSync(batPath, { recursive: true, force: true });
          return true;
        },
        createTestProject() {
          // Clone base-module repository if not already present in project root. CI creates this in Github actions.
          if (!existsSync(baseModulePath)) {
            execSync(
              'cd ../../&&git clone git@github.com:CyberismoCom/module-base.git .tmp/module-base',
            );
          }

          // Create test project from module-base
          execSync(
            'cd ../../.tmp&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat&&cd cyberismo-bat&&cyberismo import module ../module-base&&cyberismo create card base/templates/page',
          );
          return true;
        },
      });
    },
  },
});
