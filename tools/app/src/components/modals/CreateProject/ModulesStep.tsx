// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Checkbox, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { ModuleSettingFromHub } from '@cyberismo/model';
import { OptionCard, OptionCardGrid } from '@/components/OptionCard';

interface ModulesStepProps {
  modules: ModuleSettingFromHub[] | undefined;
  selectedModules: Set<string>;
  onToggleModule: (name: string) => void;
  disabled: boolean;
}

export function ModulesStep({
  modules,
  selectedModules,
  onToggleModule,
  disabled,
}: ModulesStepProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <Box>
        <Typography level="title-md">
          {t('projectDialog.selectModules')}
        </Typography>
        <Typography level="body-sm">
          {t('projectDialog.selectModulesSubtitle')}
        </Typography>
      </Box>
      {modules && modules.length > 0 && (
        <OptionCardGrid>
          {modules.map((mod) => (
            <OptionCard
              key={mod.name}
              title={mod.displayName ?? mod.name}
              caption={mod.location}
              disabled={disabled}
              onClick={() => onToggleModule(mod.name)}
              action={
                <Checkbox
                  checked={selectedModules.has(mod.name)}
                  readOnly
                  variant="soft"
                  tabIndex={-1}
                  sx={{ pointerEvents: 'none' }}
                />
              }
            />
          ))}
        </OptionCardGrid>
      )}
      {modules && modules.length === 0 && (
        <Typography level="body-sm" color="neutral">
          {t('projectDialog.noProjectsFound')}
        </Typography>
      )}
    </Stack>
  );
}
