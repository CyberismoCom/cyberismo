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

import type {
  Context,
  Skill,
  SkillContent,
  SkillLookupResult,
  SkillSummary,
} from '@cyberismo/model';

import type { Checkout } from '../../infra/checkout/checkout.js';
import { findCard } from '../cards/read.js';
import { CardNotFoundError } from '../../shared/exceptions/index.js';
import { generateReportContent } from './report.js';

// Maps a full skill resource to a lightweight discovery summary.
function toSkillSummary(
  skill: Skill,
  scope: SkillSummary['scope'],
): SkillSummary {
  const { name, displayName, description, category, relatedTools } = skill;

  return {
    name,
    displayName,
    description,
    category,
    relatedTools,
    scope,
  };
}

/**
 * Lists the skills currently enabled by the project's logic programs.
 *
 * A skill is enabled either globally (`enableSkill/1`) or for specific cards
 * (`enableSkill/2`). Without a cardKey, all enabled skills are returned
 * (global + every card-specific skill); with a cardKey, the result is the
 * global skills plus those enabled for that card. Enablement is evaluated
 * against the current project state on every call.
 * @param options.cardKey Optional card to scope card-specific skills to.
 * @param options.category Optional category filter.
 * @param context Calculation context.
 * @returns lightweight summaries of the enabled skills, sorted by name.
 */
export async function listSkills(
  checkout: Checkout,
  options: { cardKey?: string; category?: string } = {},
  context: Context = 'localApp',
): Promise<SkillSummary[]> {
  const enabled = await checkout.calculationEngine.runQuery(
    'enabledSkills',
    context,
    { cardKey: options.cardKey },
  );
  const summaries: SkillSummary[] = [];
  for (const { key, scope } of enabled) {
    const resource = checkout.resources.byType(key, 'skills');
    if (!resource) continue;
    const skill = resource.show();
    if (options.category && skill.category !== options.category) continue;
    summaries.push(toSkillSummary(skill, scope));
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns a single enabled skill with its rendered instructions.
 *
 * The skill must be enabled by the logic programs. A card-specific skill
 * requested without a cardKey cannot be rendered meaningfully, so a
 * 'needs-card' marker is returned instead of throwing.
 * @param name Full skill resource name.
 * @param options.cardKey Card context for per-card template rendering.
 * @param context Calculation context.
 * @returns the rendered skill ('ok'), or a marker ('not-enabled' / 'needs-card').
 */
export async function getSkill(
  checkout: Checkout,
  name: string,
  options: { cardKey?: string } = {},
  context: Context = 'localApp',
): Promise<SkillLookupResult> {
  const { cardKey } = options;

  let exists: boolean;
  try {
    exists = checkout.resources.exists(name);
  } catch {
    exists = false;
  }
  if (!exists) {
    return { status: 'not-found' };
  }

  if (cardKey) {
    try {
      findCard(checkout, cardKey);
    } catch (error) {
      if (error instanceof CardNotFoundError) {
        return { status: 'card-not-found' };
      }
      throw error;
    }
  }

  const enabled = await checkout.calculationEngine.runQuery(
    'enabledSkills',
    context,
    { cardKey },
  );
  const entry = enabled.find((row) => row.key === name);
  if (!entry) {
    return { status: 'not-enabled' };
  }
  // A card-specific skill can't be rendered meaningfully without a cardKey.
  if (entry.scope === 'card' && !cardKey) {
    return { status: 'needs-card' };
  }
  const skill = checkout.resources.byType(name, 'skills').show();
  const instructions = await renderSkillTemplates(
    checkout,
    skill.content,
    { cardKey },
    context,
  );
  return {
    status: 'ok',
    skill: { ...toSkillSummary(skill, entry.scope), instructions },
  };
}

/**
 * Renders skill templates that have already been looked up.
 * @param content The skill's stored content.
 * @param options.cardKey Card context for per-card template rendering.
 * @param options.skillContent Overrides the stored skill.md content.
 * @param options.skillQuery Overrides the stored query.lp content.
 * @param context Calculation context.
 * @returns the rendered instructions.
 */
export async function renderSkillTemplates(
  checkout: Checkout,
  content: SkillContent,
  options: { cardKey?: string; skillContent?: string; skillQuery?: string },
  context: Context,
): Promise<string> {
  return generateReportContent({
    calculate: checkout.calculationEngine,
    contentTemplate: options.skillContent ?? content.skillContent,
    queryTemplate: options.skillQuery ?? content.skillQuery,
    options: { cardKey: options.cardKey },
    context,
  });
}
