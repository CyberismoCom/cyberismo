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
  Box,
  Button,
  Card,
  CardOverflow,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Radio,
  Stack,
  Typography,
} from '@mui/joy';
import ClearIcon from '@mui/icons-material/Clear';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useAvailableProjects } from '@/lib/api/projects';

interface ProjectSelectionModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, the modal cannot be dismissed (used on the landing page) */
  dismissable?: boolean;
}

export function ProjectSelectionModal({
  open,
  onClose,
  dismissable = true,
}: ProjectSelectionModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectPrefix: currentPrefix } = useParams();
  const { data: projects, isLoading } = useAvailableProjects();

  const [filter, setFilter] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(
    currentPrefix ?? null,
  );

  const filteredProjects = (projects ?? []).filter(
    (p) =>
      !filter ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.prefix.toLowerCase().includes(filter.toLowerCase()),
  );

  const handleClose = () => {
    setFilter('');
    setSelectedProject(null);
    onClose();
  };

  const handleProjectSelect = (projectPrefix: string) => {
    navigate(`/projects/${projectPrefix}/cards`);
    handleClose();
  };

  return (
    <Modal open={open} onClose={dismissable ? handleClose : undefined}>
      <ModalDialog
        sx={{
          height: '90%',
          width: '60%',
          minWidth: 400,
        }}
      >
        {dismissable && <ModalClose />}

        <DialogTitle>{t('projectDialog.title')}</DialogTitle>
        <Input
          type="text"
          autoFocus
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelectedProject(null);
          }}
          placeholder={t('projectDialog.searchProjects')}
          endDecorator={
            filter && (
              <IconButton
                variant="plain"
                size="sm"
                onClick={() => {
                  setFilter('');
                  setSelectedProject(null);
                }}
                aria-label="Clear"
              >
                <ClearIcon />
              </IconButton>
            )
          }
        />
        <DialogContent sx={{ padding: 2 }}>
          <Box sx={{ overflowY: 'auto', overflowX: 'hidden' }}>
            {isLoading ? (
              <Stack alignItems="center" py={4}>
                <CircularProgress size="md" />
              </Stack>
            ) : filteredProjects.length === 0 ? (
              <Typography level="body-xs" color="neutral">
                {t('projectDialog.noProjectsFound')}
              </Typography>
            ) : (
              <Grid
                container
                gap={2}
                justifyContent="flex-start"
                marginTop={2}
                marginBottom={4}
                marginLeft={0}
                paddingRight={1}
              >
                {filteredProjects.map((p) => (
                  <Card
                    key={p.prefix}
                    variant="outlined"
                    sx={{
                      height: '200px',
                      width: '200px',
                      boxShadow: '0px 2px 2px 0px rgba(0, 0, 0, 0.5)',
                      cursor: 'pointer',
                      padding: 0,
                      overflow: 'hidden',
                      gap: 0,
                      borderRadius: 16,
                      ...(p.prefix === currentPrefix && {
                        borderColor: 'primary.500',
                        borderWidth: 2,
                      }),
                    }}
                    onClick={() => setSelectedProject(p.prefix)}
                    onDoubleClick={() => handleProjectSelect(p.prefix)}
                  >
                    <Stack
                      direction="row"
                      padding={0}
                      sx={{ justifyContent: 'space-between' }}
                    >
                      <Typography
                        level="title-sm"
                        paddingLeft={2}
                        fontWeight="bold"
                        textOverflow="clip"
                        marginTop="auto"
                        marginBottom={0.5}
                      >
                        {p.name}
                      </Typography>
                      <Box padding={1}>
                        <Radio
                          checked={selectedProject === p.prefix}
                          variant="soft"
                          tabIndex={-1}
                          sx={{ pointerEvents: 'none' }}
                        />
                      </Box>
                    </Stack>
                    <CardOverflow sx={{ flexGrow: 1 }}>
                      <Box bgcolor="neutral.softBg" height="100%" px={2} py={1}>
                        <Typography
                          level="body-xs"
                          fontWeight="bold"
                          sx={{ wordBreak: 'break-word' }}
                        >
                          {p.prefix}
                        </Typography>
                        {p.category && (
                          <Typography level="body-xs" sx={{ mt: 0.5 }}>
                            {p.category}
                          </Typography>
                        )}
                        {p.description && (
                          <Typography
                            level="body-xs"
                            color="neutral"
                            sx={{
                              mt: 0.5,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {p.description}
                          </Typography>
                        )}
                      </Box>
                    </CardOverflow>
                  </Card>
                ))}
              </Grid>
            )}
          </Box>
          <DialogActions sx={{ marginTop: 'auto' }}>
            <Button
              disabled={selectedProject === null}
              onClick={() => {
                if (selectedProject) {
                  handleProjectSelect(selectedProject);
                }
              }}
              color="primary"
            >
              {t('projectDialog.open')}
            </Button>
            <Button onClick={handleClose} variant="plain" color="neutral">
              {t('cancel')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

export default ProjectSelectionModal;
