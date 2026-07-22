/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { copyDir } from '../../src/utils/file-utils.js';
import { CommandManager } from '../../src/command-manager.js';
import { createCardFacts } from '../../src/utils/clingo-facts.js';
import type { Card } from '../../src/index.js';

const FIELD = 'decision/fieldTypes/obsoletedBy';

// Note: the fixture's only top-level card (decision_5) uses the
// "simplepage" card type, which has no custom fields at all. The
// "decision" card type (which already declares obsoletedBy as a
// calculated field) is instead used by decision_5's child card,
// decision_6 - so that card is used here instead of a top-level one.
const CARD_KEY = 'decision_6';

describe('fieldOverride fact generation', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-override-facts-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    // Enable override on the calculated field in the card type definition.
    const cardTypePath = join(
      projectPath,
      '.cards/local/cardTypes/decision.json',
    );
    const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
    const field = cardType.customFields.find(
      (f: { name: string }) => f.name === FIELD,
    );
    field.enableOverride = true;
    writeFileSync(cardTypePath, JSON.stringify(cardType, null, 4));

    // Store an override value directly in a card's index.json.
    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[FIELD] = 'decision_999';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    commands = new CommandManager(projectPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('stored value on an override-enabled calculated field becomes fieldOverride', async () => {
    const card = commands.project.findCard(CARD_KEY) as Card;
    const facts = await createCardFacts(card, commands.project);
    expect(facts).toContain(
      `fieldOverride(${CARD_KEY}, "${FIELD}", "decision_999").`,
    );
    expect(facts).not.toContain(`field(${CARD_KEY}, "${FIELD}"`);
  });

  it('stored values on regular fields still become field facts', async () => {
    const card = commands.project.findCard(CARD_KEY) as Card;
    const facts = await createCardFacts(card, commands.project);
    expect(facts).toContain(`field(${CARD_KEY}, "title"`);
    expect(facts).not.toContain(`fieldOverride(${CARD_KEY}, "title"`);
  });
});
