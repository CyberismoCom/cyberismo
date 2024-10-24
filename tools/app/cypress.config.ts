import { defineConfig } from 'cypress';
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';

const batPath = '../../cyberismo-bat';
const basePath = '../../module-base';

export default defineConfig({
  e2e: {
    baseUrl:'http://localhost:3000',
    setupNodeEvents(on, config) {
      on('task', {
        deleteBaseModule() {
          rmSync(batPath, { recursive: true, force: true });
          rmSync(basePath, { recursive: true, force: true });
          return true;
        },
        createBaseModule() {
          execSync('cd ../../&&git clone git@github.com:CyberismoCom/module-base.git&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat&&cd cyberismo-bat&&cyberismo import module ../module-base&&cyberismo create card base/templates/page')
          return true;
        },
      });
    },
  },
});
