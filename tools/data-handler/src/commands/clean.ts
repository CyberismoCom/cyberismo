/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Project } from '../containers/project.js';
import { ResourcesFrom } from '../containers/project/resources-from.js';
import { isPredefinedField } from '../utils/constants.js';
import { getChildLogger } from '../utils/log-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { read, write } from '../utils/rw-lock.js';

import type {
  Card,
  CardMetadata,
  MetadataContent,
} from '../interfaces/project-interfaces.js';
import type { CustomField } from '../interfaces/resource-interfaces.js';

// The logger is initialized while the project loads, so the child logger is
// taken at call time; binding it at module scope would keep the silent default.
const logger = () => getChildLogger({ module: 'clean' });

export type CleanReason = 'null-value' | 'undeclared' | 'calculated-locked';

export interface CleanFinding {
  cardKey: string;
  field: string;
  reason: CleanReason;
}

export interface CleanResult {
  findings: CleanFinding[];
  cardCount: number;
  // Cards whose card type could not be resolved; they were not inspected.
  skippedCards: string[];
  // Cards that were reported in 'findings' but could not be written.
  failedCards: string[];
  dryRun: boolean;
}

/**
 * Removes stored field values that the card's card type does not require:
 * null placeholders, keys not declared by the card type, and values on
 * calculated fields that do not enable override. Such data is preserved
 * ("dormant") until this command runs; dry-run reports without writing.
 */
export class Clean {
  constructor(private project: Project) {}

  /**
   * Removes unused custom field values from project cards and local template
   * cards. Module cards are read-only and never visited.
   *
   * A card whose update fails does not stop the run: it is listed in
   * 'failedCards' and the remaining cards are still cleaned. Removing an
   * already-removed value is a no-op, so re-running after a partial clean is
   * safe. Since per-card errors are handled here rather than raised, an
   * '--autocommit' run commits a partial clean instead of rolling it back.
   *
   * A dry run takes the read lock, which already excludes writers, so the
   * report still cannot be taken mid-write. Taking the write lock instead
   * would give a dry run a writer's side effects: an autocommit run would
   * commit and, on a failed scan, roll the working tree back.
   * @param dryRun If true, reports the findings without changing any card.
   * @param cardType Optional. Limits the scan to cards of this card type. Must
   *   be a full resource name, e.g. 'decision/cardTypes/decision'.
   * @returns What was removed, or would be removed in a dry run. Findings and
   *   card lists are sorted by card key.
   */
  public async clean(dryRun: boolean, cardType?: string): Promise<CleanResult> {
    return dryRun ? this.report(cardType) : this.removeUnused(cardType);
  }

  @read
  private async report(cardType?: string): Promise<CleanResult> {
    return this.scan(true, cardType);
  }

  @write(() => 'Remove dormant field values')
  private async removeUnused(cardType?: string): Promise<CleanResult> {
    return this.scan(false, cardType);
  }

  // Walks the cleanable cards, collecting the unused values and, unless this
  // is a dry run, removing them.
  private async scan(dryRun: boolean, cardType?: string): Promise<CleanResult> {
    const findings: CleanFinding[] = [];
    const skippedCards: string[] = [];
    const failedCards: string[] = [];

    for (const card of this.cleanableCards()) {
      if (!card.metadata) continue;
      if (cardType && card.metadata.cardType !== cardType) continue;

      const declared = this.declaredFields(card);
      if (!declared) {
        skippedCards.push(card.key);
        continue;
      }

      const removals = this.unusedFields(card.metadata, declared).map(
        (field) => ({ cardKey: card.key, ...field }),
      );
      if (removals.length === 0) continue;

      findings.push(...removals);
      if (!dryRun) {
        const metadata: Record<string, MetadataContent> = card.metadata;
        for (const removal of removals) {
          delete metadata[removal.field];
        }
        try {
          await this.project.updateCardMetadata(card, card.metadata);
        } catch (error) {
          logger().warn(error, `Could not clean card '${card.key}'`);
          failedCards.push(card.key);
        }
      }
    }

    return {
      findings: findings.sort((a, b) => sortCards(a.cardKey, b.cardKey)),
      cardCount: new Set(findings.map((finding) => finding.cardKey)).size,
      skippedCards: skippedCards.sort(sortCards),
      failedCards: failedCards.sort(sortCards),
      dryRun,
    };
  }

  // All cards this command may write to: project cards and local template cards.
  private cleanableCards(): Card[] {
    return [
      ...this.project.cards(),
      ...this.project.resources
        .templates(ResourcesFrom.localOnly)
        .flatMap((template) => template.templateCards()),
    ];
  }

  // Custom fields the card's card type declares, or undefined if the card type
  // cannot be resolved.
  private declaredFields(card: Card): Map<string, CustomField> | undefined {
    const cardTypeName = card.metadata?.cardType;
    if (!cardTypeName) {
      return undefined;
    }
    let customFields: CustomField[];
    try {
      customFields =
        this.project.resources.byType(cardTypeName, 'cardTypes').show()
          .customFields ?? [];
    } catch (error) {
      logger().warn(
        error,
        `Could not resolve card type '${cardTypeName}' of card '${card.key}'; skipping the card`,
      );
      return undefined;
    }
    return new Map(customFields.map((field) => [field.name, field]));
  }

  // Metadata keys whose stored value the card type does not use.
  private unusedFields(
    metadata: CardMetadata,
    declared: Map<string, CustomField>,
  ): Omit<CleanFinding, 'cardKey'>[] {
    const unused: Omit<CleanFinding, 'cardKey'>[] = [];
    for (const [field, value] of Object.entries(metadata)) {
      if (isPredefinedField(field)) continue;

      const declaration = declared.get(field);
      if (value === null) {
        unused.push({ field, reason: 'null-value' });
      } else if (!declaration) {
        unused.push({ field, reason: 'undeclared' });
      } else if (declaration.isCalculated && !declaration.enableOverride) {
        unused.push({ field, reason: 'calculated-locked' });
      }
    }
    return unused;
  }
}
