import { CommandManager } from '@cyberismo/data-handler';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Scales a project to a target card count by creating cards from a template.
 * Works on a temporary copy of the project.
 *
 * @param projectPath Path to the source project
 * @param targetCount Target number of cards
 * @param templateName Template to use for creating cards
 * @returns Path to the scaled temporary project (caller must clean up)
 */
export async function scaleProject(
  projectPath: string,
  targetCount: number,
  templateName: string,
): Promise<string> {
  // Copy project to temp directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'cyberismo-bench-'));
  await cp(projectPath, tmpDir, { recursive: true });

  // Note: CommandManager.getInstance() is a singleton — calling it with a new
  // path disposes the previous instance. Only use the scaler before or after
  // benchmark runs, not during. If needed mid-benchmark, use the constructor directly.
  const commands = await CommandManager.getInstance(tmpDir);
  const initialCount = commands.project.cards().length;

  if (initialCount >= targetCount) {
    console.error(
      `Project already has ${initialCount} cards (target: ${targetCount})`,
    );
    return tmpDir;
  }

  // Create one instance to determine cards per template
  const testCards = await commands.createCmd.createCard(templateName);
  const cardsPerInstance = testCards.length;
  if (cardsPerInstance === 0) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Template '${templateName}' produces 0 cards — cannot scale`,
    );
  }

  let currentCount = initialCount + cardsPerInstance;
  console.error(
    `Template '${templateName}' produces ${cardsPerInstance} card(s). Initial: ${initialCount}, target: ${targetCount}`,
  );

  // Scale up
  while (currentCount < targetCount) {
    await commands.createCmd.createCard(templateName);
    currentCount += cardsPerInstance;
    if (currentCount % 500 === 0 || currentCount >= targetCount) {
      console.error(`  ${currentCount} / ${targetCount} cards`);
    }
  }

  console.error(`Scaled to ${currentCount} cards in ${tmpDir}`);
  return tmpDir;
}

/**
 * Cleans up a temporary scaled project directory
 */
export async function cleanupScaledProject(tmpDir: string): Promise<void> {
  await rm(tmpDir, { recursive: true, force: true });
}
