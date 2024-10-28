/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  Divider,
  DialogActions,
  Button,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Input,
  Box,
  CircularProgress,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useCard, useProject } from '../../lib/api';
import { useAppSelector, useMoveableCards } from '../../lib/hooks';
import {
  deepCopy,
  filterCards,
  findCard,
  findParentCard,
} from '../../lib/utils';
import { Stack } from '@mui/system';
import { Card } from '../../lib/definitions';
import moment from 'moment';
import { TreeMenu } from '../TreeMenu';
import { useDispatch } from 'react-redux';
import { addNotification } from '@/app/lib/slices/notifications';
import { useTree } from '@/app/lib/api/tree';

export interface MoveCardModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string;
}

enum TabEnum {
  RECENTS,
  ALL,
}

export function MoveCardModal({ open, onClose, cardKey }: MoveCardModalProps) {
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { tree, isLoading } = useTree();

  // TODO: get rid of this dependency
  const { project, isLoading: isLoadingProject } = useProject();

  const { updateCard } = useCard(cardKey);
  const recents = useAppSelector((state) => state.recentlyViewed.pages);

  const dispatch = useDispatch();

  const [currentTab, setCurrentTab] = useState(TabEnum.RECENTS);

  const moveCard = useCallback(async () => {
    if (selected) {
      try {
        await updateCard({
          parent: selected,
        });
        dispatch(
          addNotification({
            message: t('moveCardModal.success'),
            type: 'success',
          }),
        );
        onClose();
      } catch (error) {
        dispatch(
          addNotification({
            message: error instanceof Error ? error.message : '',
            type: 'error',
          }),
        );
      }
    }
  }, [selected, updateCard, t, onClose, dispatch]);

  const moveableCards = useMoveableCards(cardKey);

  const moveableTree = useMemo(() => {
    return filterCards(deepCopy(tree) || [], (card) => {
      return moveableCards.some(
        (moveableCard) => moveableCard.key === card.key,
      );
    });
  }, [tree, moveableCards]);

  const recentCards = useMemo(
    () =>
      recents
        .filter((page) => moveableCards.some((card) => card.key === page.key))
        .map((page) => ({
          ...(findCard(moveableCards, page.key) as Card),
          timestamp: page.timestamp,
        })),
    [recents, moveableCards],
  );

  useEffect(() => {
    setSelected(null);
  }, [open, currentTab]);

  const searchableCards = useMemo(() => {
    if (currentTab === TabEnum.RECENTS) {
      return recentCards;
    } else {
      return moveableCards;
    }
  }, [currentTab, recentCards, moveableCards]);

  if (isLoading || !tree || !project || isLoadingProject) {
    return (
      <Box padding={2}>
        <CircularProgress size="md" color="primary" />
      </Box>
    );
  }
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        minWidth={620}
        sx={{
          height: '100%',
        }}
      >
        <DialogTitle>{t('moveCardModal.title')}</DialogTitle>
        <Divider />
        <DialogContent>
          <Input
            placeholder={t('moveCardModal.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            color="primary"
            variant="outlined"
            sx={{
              marginY: 2,
              marginX: '1px',
              flex: '0 0 auto',
            }}
          />
          {search !== '' ? (
            <Box
              flex="1 1 auto"
              flexDirection="column"
              minHeight={0}
              sx={{
                overflowY: 'scroll',
              }}
            >
              {searchableCards
                .filter(
                  (
                    page, // if search gets any more complex, use a better solution
                  ) =>
                    page.key.startsWith(search.toLowerCase()) ||
                    page.metadata?.title
                      ?.toLowerCase()
                      .startsWith(search.toLowerCase()),
                )
                .map((page) => {
                  return (
                    <Box
                      paddingY={2}
                      paddingX={3}
                      key={page.key}
                      bgcolor={
                        selected === page.key
                          ? 'primary.plainActiveBg'
                          : 'inherit'
                      }
                      onClick={() => {
                        if (selected === page.key) {
                          setSelected(null);
                        } else {
                          setSelected(page.key);
                        }
                      }}
                      sx={{
                        cursor: 'pointer',
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between">
                        <Stack>
                          <Typography level="title-sm">
                            {page.metadata?.title}
                          </Typography>
                          <Typography level="body-sm">
                            {findParentCard(project.cards || [], page.key)
                              ?.metadata?.title ?? '-'}
                          </Typography>
                        </Stack>
                        <Typography
                          level="body-xs"
                          fontWeight={600}
                          sx={{
                            color: 'text.primary',
                          }}
                        >
                          {page.key}
                        </Typography>
                      </Stack>
                    </Box>
                  );
                })}
            </Box>
          ) : (
            <Tabs
              value={currentTab}
              onChange={(e, newValue) => setCurrentTab(newValue as TabEnum)}
              sx={{
                flex: '1 1 auto',
                flexDirection: 'column',
                display: 'flex',
                minHeight: 0,
              }}
            >
              <TabList
                sx={{
                  flex: '0 0 auto',
                }}
              >
                <Tab>{t('recents')}</Tab>
                <Tab>{t('all')}</Tab>
              </TabList>
              <TabPanel
                value={TabEnum.RECENTS}
                sx={{
                  flex: '1 1 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY:
                    currentTab === TabEnum.RECENTS ? 'scroll' : 'hidden',
                }}
              >
                <>
                  {recentCards.map((page) => {
                    return (
                      <Box
                        paddingY={2}
                        paddingX={3}
                        key={page.key}
                        bgcolor={
                          selected === page.key
                            ? 'primary.plainActiveBg'
                            : 'inherit'
                        }
                        onClick={() => {
                          if (selected === page.key) {
                            setSelected(null);
                          } else {
                            setSelected(page.key);
                          }
                        }}
                        sx={{
                          cursor: 'pointer',
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between">
                          <Stack>
                            <Typography level="title-sm">
                              {page.metadata?.title}
                            </Typography>
                            <Typography level="body-sm">
                              {findParentCard(project?.cards || [], page.key)
                                ?.metadata?.title ?? '-'}
                              {' • '}
                              {t('viewedAgo', {
                                time: moment
                                  .duration(
                                    moment().diff(moment(page.timestamp)),
                                  )
                                  .humanize(),
                              })}
                            </Typography>
                          </Stack>
                          <Typography
                            level="body-xs"
                            fontWeight={600}
                            sx={{
                              color: 'text.primary',
                            }}
                          >
                            {page.key}
                          </Typography>
                        </Stack>
                      </Box>
                    );
                  })}
                </>
              </TabPanel>
              <TabPanel
                value={TabEnum.ALL}
                sx={{
                  flex: '1 1 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: currentTab === TabEnum.ALL ? 'scroll' : 'hidden',
                }}
              >
                <TreeMenu
                  selectedCardKey={selected}
                  onCardSelect={(node) => {
                    setSelected(node.data.key);
                  }}
                  title={project.name}
                  tree={moveableTree}
                />
              </TabPanel>
            </Tabs>
          )}

          <DialogActions
            sx={{
              flex: '0 0 auto',
            }}
          >
            <Button onClick={moveCard} disabled={selected === null}>
              {t('move')}
            </Button>
            <Button onClick={onClose} variant="plain" color="neutral">
              {t('cancel')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

export default MoveCardModal;
