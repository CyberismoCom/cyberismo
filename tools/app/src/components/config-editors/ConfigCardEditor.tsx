// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCardSource, useFieldTypes, useProject } from '@/lib/api';
import type { AnyNode } from '@/lib/api/types';
import { TemplateCardEditor } from './template-card/TemplateCardEditor';
import { templateCardView } from './template-card/source-view';

/**
 * Entry point for editing a template (configuration) card. Builds the card
 * view from its stored source and hands it to the edit-first TemplateCardEditor
 * (remounted per card so its working draft is seeded fresh).
 */
export function ConfigCardEditor({ node }: { node: AnyNode }) {
  const source = useCardSource(node.id);
  const project = useProject();
  const fieldTypes = useFieldTypes();
  const { t } = useTranslation();

  const error = source.error ?? project.error ?? fieldTypes.error;
  const cardType = project.project?.cardTypes.find(
    (c) => c.name === source.cardSource?.metadata?.cardType,
  );
  const card = useMemo(
    () =>
      source.cardSource && cardType && fieldTypes.fieldTypes
        ? templateCardView(source.cardSource, cardType, fieldTypes.fieldTypes)
        : null,
    [source.cardSource, cardType, fieldTypes.fieldTypes],
  );

  if (source.isLoading || project.isLoading || fieldTypes.isLoading) {
    return <div>{t('loading')}</div>;
  }
  if (error || !card) {
    return <div>{error?.message ?? t('failedToLoad')}</div>;
  }

  return <TemplateCardEditor key={node.id} node={node} card={card} />;
}
