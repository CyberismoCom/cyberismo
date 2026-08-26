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

import {
  Alert,
  Box,
  CircularProgress,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Typography,
} from '@mui/joy';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { previewSkill } from '@/lib/api';
import { FORM_FIELD_MAX_WIDTH } from '@/lib/constants';
import { formKeyHandler } from '@/lib/hooks/utils';
import MarkdownContent from '@/components/MarkdownContent';

/**
 * Renders a skill's instructions from unsaved editor content.
 *
 * The rendering happens on the server: for a template skill the query in
 * query.lp runs first and its result becomes the Handlebars context. A skill
 * enabled per card (enableSkill/2) receives the card key as context too, so a
 * card key can be supplied here to preview that case.
 */
export function SkillPreview({
  resourceName,
  content,
}: {
  resourceName: string;
  content: string;
}) {
  const { t } = useTranslation();
  const [cardKeyInput, setCardKeyInput] = useState('');
  const [cardKey, setCardKey] = useState('');
  // Each result is tagged with the request that produced it. A result for a
  // different request means one is still in flight, which avoids resetting
  // state synchronously inside the effect just to show the spinner.
  const [result, setResult] = useState<{
    request: string;
    instructions?: string;
    error?: string;
  } | null>(null);

  const request = JSON.stringify([resourceName, content, cardKey]);

  useEffect(() => {
    let active = true;
    previewSkill(resourceName, {
      skillContent: content,
      cardKey: cardKey || undefined,
    })
      .then((rendered) => {
        if (active) setResult({ request, instructions: rendered });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setResult({
          request,
          error: reason instanceof Error ? reason.message : '',
        });
      });
    return () => {
      active = false;
    };
  }, [resourceName, content, cardKey, request]);

  const commitCardKey = () => setCardKey(cardKeyInput.trim());

  const current = result?.request === request ? result : null;

  const body =
    current === null ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size="sm" />
      </Box>
    ) : current.error !== undefined ? (
      <Alert color="danger" variant="soft" data-cy="skillPreviewError">
        <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
          {current.error || t('failedToLoad')}
        </Typography>
      </Alert>
    ) : current.instructions?.trim() === '' ? (
      <Typography level="body-sm" color="neutral">
        {t('skillPreview.empty')}
      </Typography>
    ) : (
      <MarkdownContent markdown={current.instructions ?? ''} />
    );

  return (
    <Stack spacing={2} data-cy="skillPreview">
      <FormControl sx={{ maxWidth: FORM_FIELD_MAX_WIDTH }}>
        <FormLabel>{t('skillPreview.cardKey')}</FormLabel>
        <Input
          size="sm"
          value={cardKeyInput}
          placeholder={t('skillPreview.cardKeyPlaceholder')}
          onChange={(e) => setCardKeyInput(e.target.value)}
          onBlur={commitCardKey}
          onKeyDown={formKeyHandler({
            canSubmit: true,
            onSubmit: commitCardKey,
            onCancel: () => {
              setCardKeyInput(cardKey);
            },
          })}
        />
      </FormControl>
      {body}
    </Stack>
  );
}

export default SkillPreview;
