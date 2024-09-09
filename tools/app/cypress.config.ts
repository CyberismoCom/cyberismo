import { defineConfig } from 'cypress';
import { cpSync, rmSync } from 'node:fs';

const testDataPath = '../data-handler/test/test-data/valid/decision-records';
const backupPath = '../data-handler/test/test-data/valid/tmp-e2e-tests-backup';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('task', {
        makeTestDataBackup() {
          cpSync(testDataPath, backupPath, { recursive: true });
          return true;
        },
        restoreTestDataFromBackup() {
          rmSync(testDataPath, { recursive: true, force: true });
          cpSync(backupPath, testDataPath, { recursive: true });
          rmSync(backupPath, { recursive: true, force: true });
          return true;
        },
      });
    },
  },
});
