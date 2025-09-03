#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Helper for release
 * It will:
 * - Checkout main branch
 * - Fetch latest
 * - Rebase on latest
 * - Bump the version in the package.json files using pnpm bump-version
 * - Create a new release branch
 * - Create a pull request to main
 * - Push the release branch to remote
 * - Push the release branch to remote
 * - Create a pull request to main using Github CLI
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

// Bump version using pnpm
console.log(`Bumping version (${versionType})...`);
execCommand(`pnpm bump-version ${versionType}`);

// Read the new version
const newVersion = getVersion();
console.log(`New version: ${newVersion}`);

// Create release branch
const releaseBranch = `release/${newVersion}`;
console.log(`Creating release branch: ${releaseBranch}`);
execCommand(`git checkout -b ${releaseBranch}`);

// Add and commit version changes
console.log('Committing version changes...');
// only add package.json files
execCommand('git add "**/*/package.json"');
execCommand(`git commit -m "Bump version to ${newVersion}"`);

// Allow user to review the commit
// add diff and log
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
const prBody = `Release version ${newVersion}. This PR contains version bump changes for release ${newVersion}.`;

execCommand(
  `gh pr create --title "${prTitle}" --body "${prBody}" --base main --head ${releaseBranch}`,
);

console.log(`Release completed successfully!`);
console.log(`   Version: ${newVersion}`);
console.log(`   Branch: ${releaseBranch}`);
console.log(`   Pull request created`);
