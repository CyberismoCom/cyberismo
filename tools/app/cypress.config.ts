import { defineConfig } from 'cypress';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const batPath = '../../cyberismo-bat';
const baseModulePath = '../../module-base';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on, config) {
      on('task', {
        deleteTestProject() {
          rmSync(baseModulePath, { recursive: true, force: true });
          rmSync(batPath, { recursive: true, force: true });
          return true;
        },
        createTestProject() {
          // Clone base-module repository if not already present in project root. CI creates this in Github actions.
          if (!existsSync(baseModulePath)) {
            execSync(
              'cd ../../&&git clone git@github.com:CyberismoCom/module-base.git',
            );
          }

          // Create test project from module-base
          execSync(
            'cd ../../&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat&&cd cyberismo-bat&&cyberismo import module ../module-base&&cyberismo create card base/templates/page',
          );
          return true;
        },
      });
    },
  },
});
