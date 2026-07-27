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

import { Box, Checkbox, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { ModuleSettingFromHub } from '@cyberismo/data-handler';
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
                  variant="soft"
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
