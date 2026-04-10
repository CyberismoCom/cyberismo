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

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, IconButton, Stack } from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { MetadataValue } from '../../lib/definitions';
import type { CardResponse } from '../../lib/api/types';
import { getConfig, getDefaultValue } from '../../lib/utils';
import { format } from 'date-fns';
import { FieldRow } from './FieldRow';
import { EditMode } from './EditMode';

export interface MetadataViewProps {
  initialExpanded?: boolean;
  card: CardResponse;
  onUpdate?: (update: {
    metadata: Record<string, MetadataValue>;
  }) => Promise<void>;
}

export default function MetadataSection({
  initialExpanded,
  card,
  onUpdate,
}: MetadataViewProps) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded);
  const { t } = useTranslation();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(false);
  }, [card.key]);

  const canEdit = !getConfig().staticMode && !!onUpdate;

  return (
    <Box
      data-cy="metadataView"
      border="1px solid"
      borderColor={
        editing ? 'primary.outlinedBorder' : 'neutral.outlinedBorder'
      }
      borderRadius={6}
      padding={2}
      display="flex"
      flexDirection="row"
    >
      {editing ? (
        <EditMode card={card} onUpdate={onUpdate!} />
      ) : (
        <Stack flexGrow={1}>
          {(card.fields ?? []).map(
            ({
              key,
              dataType,
              enumValues,
              fieldDisplayName,
              fieldDescription,
              visibility,
              value,
            }) => (
              <FieldRow
                key={key}
                expanded={visibility === 'always' || expanded}
                value={getDefaultValue(value)}
                label={fieldDisplayName || key}
                dataType={dataType}
                description={fieldDescription}
                enumValues={enumValues}
              />
            ),
          )}
          <FieldRow
            expanded={expanded}
            value={card.cardTypeDisplayName || card.cardType}
            label={t('cardType')}
            dataType="shortText"
          />
          <FieldRow
            expanded={expanded}
            value={card.labels}
            label={t('labels')}
            dataType="label"
          />
          <FieldRow
            expanded={expanded}
            value={
              card.createdAt ? format(new Date(card.createdAt), 'PPp') : null
            }
            label={t('createdAt')}
            dataType="dateTime"
          />
          <FieldRow
            expanded={expanded}
            value={
              card.lastUpdated ? format(new Date(card.lastUpdated), 'PPp') : ''
            }
            label={t('lastUpdated')}
            dataType="dateTime"
          />
        </Stack>
      )}
      <Stack flexShrink={0} paddingLeft={1}>
        {canEdit &&
          (editing || expanded) &&
          (editing ? (
            <Button
              data-cy="metadataCloseButton"
              variant="plain"
              color="primary"
              size="sm"
              sx={{ alignSelf: 'flex-end' }}
              onClick={() => setEditing(false)}
            >
              {t('close')}
            </Button>
          ) : (
            <IconButton
              data-cy="metadataEditButton"
              variant="soft"
              color="primary"
              size="sm"
              sx={{ alignSelf: 'flex-end' }}
              onClick={() => setEditing(true)}
            >
              <EditIcon />
            </IconButton>
          ))}
        <Box flexGrow={1} />
        {!editing && (
          <Button
            data-cy="showMoreButton"
            variant="plain"
            color="primary"
            size="sm"
            endDecorator={
              <ExpandMoreIcon
                sx={{
                  transition: 'transform 0.2s',
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            }
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? t('showLess') : t('showMore')}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
