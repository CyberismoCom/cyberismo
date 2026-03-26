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

import { useState } from 'react';
import useSWR from 'swr';
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ModalClose,
  Typography,
  Button,
  Input,
  FormLabel,
  FormControl,
  Grid,
  Card,
  CardContent,
  Stack,
  Divider,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { apiPaths } from '@/lib/swr';
import type { ModuleSettingFromHub } from '@cyberismo/data-handler';

interface AddModuleModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (source: string) => Promise<void>;
}

export function AddModuleModal({ open, onClose, onAdd }: AddModuleModalProps) {
  const { t } = useTranslation();
  const [selectedModule, setSelectedModule] =
    useState<ModuleSettingFromHub | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: hubModules } = useSWR<ModuleSettingFromHub[]>(
    apiPaths.projectModulesImportable(),
  );

  const handleSelectModule = (mod: ModuleSettingFromHub) => {
    setUrlInput('');
    setSelectedModule((prev) => (prev?.name === mod.name ? null : mod));
  };

  const handleUrlChange = (value: string) => {
    setSelectedModule(null);
    setUrlInput(value);
  };

  const handleClose = () => {
    setSelectedModule(null);
    setUrlInput('');
    setError(null);
    onClose();
  };

  const handleAdd = async () => {
    const source = selectedModule?.location ?? urlInput.trim();
    if (!source) return;
    setIsImporting(true);
    setError(null);
    try {
      await onAdd(source);
      setIsImporting(false);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoad'));
      setIsImporting(false);
    }
  };

  const canSubmit = Boolean(selectedModule || urlInput.trim());

  return (
    <Modal
      open={open}
      onClose={() => (isImporting ? null : handleClose())}
      disableEscapeKeyDown
    >
      <ModalDialog size="md" sx={{ minWidth: 480 }}>
        <ModalClose disabled={isImporting} />
        <DialogTitle>
          <Stack>
            <Typography level="title-lg">
              {t('addModuleModal.title')}
            </Typography>
            <Typography level="body-sm">
              {t('addModuleModal.subtitle')}
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2}>
            {hubModules && hubModules.length > 0 && (
              <Grid container spacing={1}>
                {/* styling is poor */}
                {hubModules.map((mod) => (
                  <Grid key={mod.name} xs={4}>
                    <Card
                      variant={
                        selectedModule?.name === mod.name ? 'solid' : 'outlined'
                      }
                      color={
                        selectedModule?.name === mod.name
                          ? 'primary'
                          : 'neutral'
                      }
                      onClick={() => handleSelectModule(mod)}
                      sx={{ cursor: 'pointer', height: '100%' }}
                    >
                      <CardContent>
                        <Typography level="title-sm">
                          {mod.displayName ?? mod.name}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
            <FormControl error={Boolean(error)}>
              <FormLabel>{t('addModuleModal.moduleUrl')} *</FormLabel>
              <Input
                placeholder={t('addModuleModal.moduleUrlPlaceholder')}
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={isImporting}
              />
              {error && (
                <Typography level="body-sm" color="danger">
                  {error}
                </Typography>
              )}
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="solid"
            onClick={handleAdd}
            disabled={!canSubmit || isImporting}
            loading={isImporting}
          >
            {t('addModuleModal.addModule')}
          </Button>
          <Button
            variant="outlined"
            onClick={handleClose}
            disabled={isImporting}
          >
            {t('addModuleModal.close')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
