// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { useRawCard } from '@/lib/api';
import type { AnyNode } from '@/lib/api/types';
import { TemplateCardEditor } from './template-card/TemplateCardEditor';

/**
 * Entry point for editing a template (configuration) card. Loads the raw card
 * and hands it to the edit-first TemplateCardEditor (remounted per card so its
 * working draft is seeded fresh).
 */
export function ConfigCardEditor({ node }: { node: AnyNode }) {
  const card = useRawCard(node.id);
  const { t } = useTranslation();

  if (card.isLoading) {
    return <div>{t('loading')}</div>;
  }
  if (card.error || !card.card) {
    return <div>{card.error?.message ?? t('failedToLoad')}</div>;
  }

  return <TemplateCardEditor key={node.id} node={node} card={card.card} />;
}
