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
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { addNotification } from '@/lib/slices/notifications';
import { useAppDispatch } from '@/lib/hooks';
import { useProjectMutations } from '@/lib/api/projects';
import { useProjectModulesImportable } from '@/lib/api/projectSettings';
import { addModule } from '@/lib/api/projectSettings';
import { MethodStep } from './CreateProject/MethodStep';
import { CloneStep } from './CreateProject/CloneStep';
import { ProjectInfoStep } from './CreateProject/ProjectInfoStep';
import {
  canSubmitProjectForm,
  type ProjectFormData,
} from './CreateProject/projectFormUtils.js';
import { ModulesStep } from './CreateProject/ModulesStep';

type WizardStep = 'method' | 'clone' | 'projectInfo' | 'modules';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [step, setStep] = useState<WizardStep>('method');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloneUrl, setCloneUrl] = useState('');
  const [form, setForm] = useState<ProjectFormData>({
    name: '',
    prefix: '',
    category: '',
    description: '',
  });
  const [createdPrefix, setCreatedPrefix] = useState<string | null>(null);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(),
  );
  const { createProject, cloneProject, isUpdating } = useProjectMutations();

  const { data: hubModules } = useProjectModulesImportable(createdPrefix || '');

  const resetState = () => {
    setStep('method');
    setIsLoading(false);
    setError(null);
    setCloneUrl('');
    setForm({ name: '', prefix: '', category: '', description: '' });
    setCreatedPrefix(null);
    setSelectedModules(new Set());
  };

  const handleClose = () => {
    if (isLoading) return;
    resetState();
    onClose();
  };

  const handleNavigateToProject = (prefix: string) => {
    navigate(`/projects/${prefix}/cards`);
    handleClose();
  };

  const handleClone = async () => {
    if (!cloneUrl.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await cloneProject({ url: cloneUrl.trim() });
      dispatch(
        addNotification({
          message: t('projectDialog.cloneSuccess'),
          type: 'success',
        }),
      );
      if (result.projects.length > 0) {
        handleNavigateToProject(result.projects[0].prefix);
      } else {
        handleClose();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('projectDialog.cloneError'),
      );
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!canSubmitProjectForm(form)) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await createProject({
        name: form.name.trim(),
        prefix: form.prefix.trim().toLowerCase(),
        category: form.category.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      setCreatedPrefix(result.prefix);
      setStep('modules');
      dispatch(
        addNotification({
          message: t('projectDialog.createSuccess'),
          type: 'success',
        }),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('projectDialog.createError'),
      );
    }
    setIsLoading(false);
  };

  const handleToggleModule = (moduleName: string) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleName)) next.delete(moduleName);
      else next.add(moduleName);
      return next;
    });
  };

  const handleFinishWithModules = async () => {
    if (!createdPrefix) return;
    setIsLoading(true);
    try {
      for (const moduleName of selectedModules) {
        const mod = hubModules?.find((m) => m.name === moduleName);
        if (mod) {
          await addModule(mod.location, createdPrefix);
        }
      }
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : t('failedToLoad'),
          type: 'error',
        }),
      );
    }
    setIsLoading(false);
    handleNavigateToProject(createdPrefix);
  };

  const progressValue =
    step === 'method'
      ? 0
      : step === 'clone'
        ? 50
        : step === 'projectInfo'
          ? 50
          : 100;

  const backButtonProps = {
    variant: 'plain' as const,
    color: 'neutral' as const,
    disabled: isLoading,
  };

  return (
    <Modal open={open} onClose={isLoading ? undefined : handleClose}>
      <ModalDialog
        sx={{
          width: { xs: '95vw', sm: '60%' },
          minWidth: { sm: 480 },
          maxHeight: { xs: '95vh', sm: '90%' },
        }}
      >
        <ModalClose disabled={isLoading} />
        <DialogTitle>{t('projectDialog.createTitle')}</DialogTitle>
        <LinearProgress determinate value={progressValue} sx={{ my: 1 }} />
        <Divider />
        <DialogContent sx={{ overflow: 'auto' }}>
          {error && (
            <Alert color="danger" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}
          {step === 'method' && (
            <MethodStep
              onSelect={(m) => setStep(m === 'clone' ? 'clone' : 'projectInfo')}
            />
          )}
          {step === 'clone' && (
            <CloneStep
              url={cloneUrl}
              onUrlChange={setCloneUrl}
              disabled={isLoading}
            />
          )}
          {step === 'projectInfo' && (
            <ProjectInfoStep
              form={form}
              onChange={setForm}
              disabled={isLoading}
            />
          )}
          {step === 'modules' && (
            <ModulesStep
              modules={hubModules}
              selectedModules={selectedModules}
              onToggleModule={handleToggleModule}
              disabled={isLoading}
            />
          )}
        </DialogContent>
        <DialogActions>
          {step === 'clone' && (
            <>
              <Button
                onClick={handleClone}
                disabled={!cloneUrl.trim() || isUpdating('clone-project')}
                loading={isUpdating('clone-project')}
              >
                {t('projectDialog.clone')}
              </Button>
              <Button
                {...backButtonProps}
                onClick={() => {
                  setCloneUrl('');
                  setStep('method');
                }}
              >
                {t('projectDialog.back')}
              </Button>
            </>
          )}
          {step === 'projectInfo' && (
            <>
              <Button
                onClick={handleCreateProject}
                disabled={
                  !canSubmitProjectForm(form) || isUpdating('create-project')
                }
                loading={isUpdating('create-project')}
              >
                {t('projectDialog.next')}
              </Button>
              <Button {...backButtonProps} onClick={() => setStep('method')}>
                {t('projectDialog.back')}
              </Button>
            </>
          )}
          {step === 'modules' && (
            <>
              <Button
                onClick={handleFinishWithModules}
                disabled={selectedModules.size === 0 || isLoading}
                loading={isLoading}
              >
                {t('projectDialog.createProject')}
              </Button>
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => {
                  if (createdPrefix) handleNavigateToProject(createdPrefix);
                }}
                disabled={isLoading}
              >
                {t('projectDialog.skip')}
              </Button>
              <Button
                {...backButtonProps}
                onClick={() => setStep('projectInfo')}
              >
                {t('projectDialog.back')}
              </Button>
            </>
          )}
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
