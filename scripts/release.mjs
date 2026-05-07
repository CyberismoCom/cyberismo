#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

/**
 * Helper for release. It will:
 * - Checkout main, fetch, rebase
 * - Bump versions in the workspace via `pnpm bump-version`
 * - Pause so the maintainer can update CHANGELOG.md with a section for the
 *   new version
 * - Validate the changelog matches the new version
 * - Branch, stage package.json files + CHANGELOG.md, commit, push, open PR
 */

function execCommand(command, options = {}) {
  console.log(`Executing: ${command}`);
  try {
    const result = execSync(command, {
      stdio: 'inherit',
      encoding: 'utf8',
      ...options,
    });
    return result;
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

function validateVersionType(versionType) {
  const validTypes = ['major', 'minor', 'patch'];
  if (!validTypes.includes(versionType)) {
    console.error(`Invalid version type: ${versionType}`);
    console.error(`Valid types are: ${validTypes.join(', ')}`);
    process.exit(1);
  }
}

function getVersion() {
  const packageJsonPath = 'tools/cli/package.json';
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function revertPackageJsonBumps() {
  // Restore working-tree package.json files so a re-run starts from a clean
  // state. Leaves CHANGELOG.md edits alone — the maintainer will want to keep
  // those.
  try {
    execSync('git restore "**/*/package.json"', { stdio: 'inherit' });
  } catch {
    // best-effort
  }
}

function validateChangelog(version) {
  if (!existsSync('CHANGELOG.md')) {
    console.error(
      `\nCHANGELOG.md is missing. Add a section at the top with the heading "## [${version}] — <date>", then re-run this script.`,
    );
    return false;
  }
  const content = readFileSync('CHANGELOG.md', 'utf8');
  const firstHeading = content.match(/^## \[.*$/m)?.[0];
  if (!firstHeading || !firstHeading.startsWith(`## [${version}]`)) {
    console.error(
      `\nCHANGELOG.md top heading is "${firstHeading ?? '<none>'}", expected to start with "## [${version}]". Update CHANGELOG.md and re-run.`,
    );
    return false;
  }
  if (content.includes('<!-- REVIEW:')) {
    console.error(
      '\nCHANGELOG.md still contains a <!-- REVIEW: --> marker. Remove it (and finish any associated edits) before re-running.',
    );
    return false;
  }
  return true;
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node release.mjs <major|minor|patch>');
  process.exit(1);
}

const versionType = args[0];
validateVersionType(versionType);

// check that Github CLI is authenticated
execCommand('gh auth status');

console.log(`Starting release process with version type: ${versionType}`);

// Make sure we're on main branch
console.log("Making sure we're on main branch...");
execCommand('git checkout main');

// Fetch latest changes
console.log('Fetching latest changes...');
execCommand('git fetch origin');

// Rebase on latest main
console.log('Rebasing on latest main...');
execCommand('git rebase origin/main');

// Bump version using pnpm (writes new versions to working tree, not committed)
console.log(`Bumping version (${versionType})...`);
execCommand(`pnpm bump-version ${versionType}`);

// Read the new version
const newVersion = getVersion();
console.log(`New version: ${newVersion}`);

console.log(
  `\n────────────────────────────────────────────────────────────────────`,
);
console.log(
  `Update CHANGELOG.md: add a new section at the top with the heading`,
);
console.log(``);
console.log(`    ## [${newVersion}] — <date>`);
console.log(``);
console.log(
  `Make sure no <!-- REVIEW: --> markers remain. Press enter when ready.`,
);
console.log(
  `────────────────────────────────────────────────────────────────────\n`,
);
await new Promise((resolve) => process.stdin.once('data', resolve));

if (!validateChangelog(newVersion)) {
  console.error(
    '\nReverting package.json bumps so you can re-run cleanly. CHANGELOG.md is left as-is.',
  );
  revertPackageJsonBumps();
  process.exit(1);
}

// Create release branch
const releaseBranch = `release/${newVersion}`;
console.log(`Creating release branch: ${releaseBranch}`);
execCommand(`git checkout -b ${releaseBranch}`);

// Stage version bumps and changelog, then commit as a single coherent change
console.log('Committing release...');
execCommand('git add "**/*/package.json" CHANGELOG.md');
execCommand(`git commit -m "Release v${newVersion}"`);

// Allow user to review the commit
execCommand('git diff main');
execCommand('git log --oneline -2');

console.log('Please review the commit and press any key to continue...');
await new Promise((resolve) => process.stdin.once('data', resolve));

// Push release branch to remote
console.log('Pushing release branch to remote...');
execCommand(`git push origin ${releaseBranch}`);

// Create pull request using Github CLI
console.log('Creating pull request...');
const prTitle = `Release v${newVersion}`;
const prBody = `Release version ${newVersion}. This PR contains version bump changes and the CHANGELOG.md entry for release ${newVersion}.`;

execCommand(
  `gh pr create --title "${prTitle}" --body "${prBody}" --base main --head ${releaseBranch}`,
);

console.log(`Release completed successfully!`);
console.log(`   Version: ${newVersion}`);
console.log(`   Branch: ${releaseBranch}`);
console.log(`   Pull request created`);
