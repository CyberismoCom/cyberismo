/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Chip, ChipDelete, IconButton, Input, Stack } from '@mui/joy';
import Add from '@mui/icons-material/Add';

import { LABEL_SPLITTER } from '../lib/constants';

export interface LabelEditorProps {
  value: string[] | null;
  onChange?: (value: string[] | null) => void;
  disabled?: boolean;
  focus?: boolean;
}

export default function LabelEditor({
  value,
  onChange,
  disabled,
  focus,
}: LabelEditorProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');

  const handleAddLabel = () => {
    if (!inputValue.trim()) {
      setInputValue('');
      return;
    }

    const labels = Array.isArray(value) ? [...value] : [];
    const segments = inputValue
      .split(LABEL_SPLITTER)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    // combine labels without duplicates
    for (const segment of segments) {
      if (!labels.includes(segment)) {
        labels.push(segment);
      }
    }

    if (segments.length > 0) {
      onChange?.(labels);
      setInputValue(''); // only clear if something was added
    }
  };

  return (
    <Stack spacing={1} width="100%">
      <Stack direction="row" spacing={1}>
        <Input
          onChange={(e) => setInputValue(e.target.value)}
          disabled={disabled}
          value={inputValue}
          color="primary"
          size="sm"
          fullWidth
          placeholder={t('placeholder.label')}
          data-cy="labelInput"
          autoFocus={focus}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleAddLabel();
            }
          }}
        />
        <IconButton
          size="sm"
          color="primary"
          variant="soft"
          data-cy="labelAddButton"
          onClick={handleAddLabel}
        >
          <Add />
        </IconButton>
      </Stack>
      <Box>
        {(value ?? []).map((label) => (
          <Chip
            key={label}
            variant="soft"
            color="primary"
            endDecorator={
              <ChipDelete
                disabled={disabled}
                aria-label={t('removeLabel')}
                onDelete={() =>
                  onChange?.(
                    (value ?? []).filter(
                      (currentLabel) => label !== currentLabel,
                    ),
                  )
                }
              />
            }
          >
            {label}
          </Chip>
        ))}
      </Box>
    </Stack>
  );
}
