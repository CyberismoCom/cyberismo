// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Card, CardType, FieldType } from '@cyberismo/model';
import type { CardView } from '@/lib/api/types';

type ViewField = CardView['fields'][number];

/**
 * Returns null when the source has no metadata or a field type is not loaded.
 * Builds the card view of a template card from its stored source. A template
 * card has no workflow state, links or policy checks, so only the custom
 * fields, labels and body are populated.
 */
export function templateCardView(
  source: Card,
  cardType: CardType,
  fieldTypes: FieldType[],
): CardView | null {
  const metadata = source.metadata;
  if (!metadata) return null;
  const fields: CardView['fields'] = [];
  for (const [index, customField] of cardType.customFields.entries()) {
    const fieldType = fieldTypes.find((f) => f.name === customField.name);
    if (!fieldType) return null;
    const stored = metadata[customField.name] as ViewField['value'];
    const isOverridable = !!(
      customField.isCalculated && customField.enableOverride
    );
    fields.push({
      key: customField.name,
      visibility: 'always' as const,
      index,
      fieldDisplayName: fieldType.displayName,
      fieldDescription: fieldType.description ?? '',
      dataType: fieldType.dataType,
      isCalculated: customField.isCalculated,
      isOverridable,
      overrideValue: isOverridable ? stored : undefined,
      value: stored,
      // Stored enum definitions lack the query's index and key.
      enumValues: (fieldType.enumValues ?? []) as ViewField['enumValues'],
    });
  }
  return {
    key: source.key,
    rank: metadata.rank,
    title: metadata.title || '',
    cardType: metadata.cardType || '',
    cardTypeDisplayName: metadata.cardType,
    workflowState: '',
    lastUpdated: metadata.lastUpdated,
    createdAt: metadata.createdAt,
    fields,
    labels: metadata.labels || [],
    links: [],
    notifications: [],
    policyChecks: { successes: [], failures: [] },
    deniedOperations: {
      transition: [],
      move: [],
      delete: [],
      editField: [],
      editContent: [],
    },
    rawContent: source.content || '',
    adocContent: '',
    attachments: source.attachments,
    path: source.path,
  };
}
