/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Box, CircularProgress, Stack, Table, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useCardDiff } from '@/lib/api/changesets';
import { lineDiff, type DiffLine } from '@/lib/lineDiff';

const formatValue = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? '—'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

const lineStyles: Record<DiffLine['kind'], { prefix: string; bg?: string }> = {
  same: { prefix: '  ' },
  added: { prefix: '+ ', bg: 'success.softBg' },
  removed: { prefix: '- ', bg: 'danger.softBg' },
};

/** A text compared line by line: added lines green, removed lines red. */
export function TextDiff({ before, after }: { before: string; after: string }) {
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        maxHeight: 400,
        overflow: 'auto',
        fontSize: 'sm',
        fontFamily: 'code',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'sm',
      }}
    >
      {lineDiff(before, after).map((line, index) => (
        <Box
          key={index}
          sx={{
            bgcolor: lineStyles[line.kind].bg,
            px: 1,
            whiteSpace: 'pre-wrap',
          }}
        >
          {lineStyles[line.kind].prefix}
          {line.text}
        </Box>
      ))}
    </Box>
  );
}

/** One card before and after a changeSet's changes. */
export function CardChangeDiff({
  changeSetId,
  cardKey,
}: {
  changeSetId: string;
  cardKey: string;
}) {
  const { t } = useTranslation();
  const { diff, isLoading, error } = useCardDiff(changeSetId, cardKey);
  if (isLoading) return <CircularProgress size="sm" />;
  if (error || !diff) {
    return (
      <Typography color="danger" level="body-sm">
        {error instanceof Error ? error.message : t('changeSet.diffFailed')}
      </Typography>
    );
  }
  const { change, before, after } = diff;
  const links = [
    ...change.links.added.map((link) => ({ sign: '+', link })),
    ...change.links.removed.map((link) => ({ sign: '−', link })),
  ];
  const attachments = [
    ...change.attachments.added.map((name) => `+ ${name}`),
    ...change.attachments.removed.map((name) => `− ${name}`),
  ];
  return (
    <Stack spacing={2} data-cy="cardChangeDiff">
      {change.fields.length > 0 && (
        <Table size="sm" sx={{ '& td': { verticalAlign: 'top' } }}>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>{t('changeSet.field')}</th>
              <th>{t('changeSet.before')}</th>
              <th>{t('changeSet.after')}</th>
            </tr>
          </thead>
          <tbody>
            {change.fields.map((field) => (
              <tr key={field.field}>
                <td>{field.field}</td>
                <td>{formatValue(field.before)}</td>
                <td>{formatValue(field.after)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {links.length > 0 && (
        <Box>
          <Typography level="title-sm">{t('changeSet.links')}</Typography>
          {links.map(({ sign, link }) => (
            <Typography
              level="body-sm"
              key={`${sign}${link.linkType}${link.cardKey}`}
            >
              {sign} {link.linkType} → {link.cardKey}
              {link.linkDescription ? ` (${link.linkDescription})` : ''}
            </Typography>
          ))}
        </Box>
      )}
      {attachments.length > 0 && (
        <Box>
          <Typography level="title-sm">{t('changeSet.attachments')}</Typography>
          {attachments.map((line) => (
            <Typography level="body-sm" key={line}>
              {line}
            </Typography>
          ))}
        </Box>
      )}
      {change.contentChanged && (
        <Box>
          <Typography level="title-sm" sx={{ mb: 0.5 }}>
            {t('changeSet.content')}
          </Typography>
          <TextDiff
            before={before?.content ?? ''}
            after={after?.content ?? ''}
          />
        </Box>
      )}
    </Stack>
  );
}
