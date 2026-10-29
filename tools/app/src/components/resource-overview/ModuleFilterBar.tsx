// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Button, Checkbox, Stack, Typography } from '@mui/joy';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useTranslation } from 'react-i18next';

export type ModuleFilterOption = {
  id: string;
  label: string;
};

export function ModuleFilterBar({
  options,
  selected,
  onChange,
}: {
  options: ModuleFilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const { t } = useTranslation();
  const selectedSet = new Set(selected);

  return (
    <Stack spacing={1.25}>
      <Typography level="title-lg">{t('overview.filter')}</Typography>
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {options.map((opt) => (
          <Button
            key={opt.id}
            variant="outlined"
            color="primary"
            size="sm"
            onChange={() => {
              if (selectedSet.has(opt.id)) {
                onChange(selected.filter((id) => id !== opt.id));
              } else {
                onChange([...selected, opt.id]);
              }
            }}
          >
            <Checkbox
              checked={selectedSet.has(opt.id)}
              overlay
              label={
                <Typography level="body-sm" color="primary">
                  {opt.label}
                </Typography>
              }
              color="primary"
              size="sm"
              sx={{
                alignItems: 'center',
              }}
            />
          </Button>
        ))}
      </Stack>

      <Box>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          startDecorator={<CloseRounded />}
          disabled={selected.length === 0}
          onClick={() => onChange([])}
        >
          {t('overview.clearFilters')}
        </Button>
      </Box>
    </Stack>
  );
}
