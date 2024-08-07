import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Checkbox,
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  Divider,
  DialogActions,
  Button,
  Alert,
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
  const { project, isLoading } = useProject();
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
    return filterCards(deepCopy(project?.cards) || [], (card) => {
      return moveableCards.some(
        (moveableCard) => moveableCard.key === card.key,
      );
    });
  }, [project, moveableCards]);

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

  if (isLoading || !project) {
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
                    page.metadata?.summary
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
                            {page.metadata?.summary}
                          </Typography>
                          <Typography level="body-sm">
                            {findParentCard(project?.cards || [], page.key)
                              ?.metadata?.summary ?? '-'}
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
                              {page.metadata?.summary}
                            </Typography>
                            <Typography level="body-sm">
                              {findParentCard(project?.cards || [], page.key)
                                ?.metadata?.summary ?? '-'}
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
                  cards={moveableTree}
                  selectedCardKey={selected}
                  onCardSelect={(cardKey) => {
                    setSelected(cardKey);
                  }}
                  title={project.name}
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
