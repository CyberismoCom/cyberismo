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
import AppToolbar from '../components/AppToolbar';
import { useOptionalKeyParam } from '@/lib/hooks';
import { Stack, styled } from '@mui/joy';
import { Outlet } from 'react-router';
import {
  NewCardModal,
  NewFieldTypeModal,
  NewCardTypeModal,
} from '../components/modals';
import {
  NewCalculationModal,
  NewGraphModelModal,
  NewGraphViewModal,
  NewLinkTypeModal,
  NewReportModal,
  NewTemplateModal,
  NewWorkflowModal,
} from '../components/modals/resource-forms';
import { useIsInCards } from '../lib/hooks';
import { useModals } from '@/lib/utils';
import { NewTemplateCardModal } from '../components/modals/resource-forms/NewTemplateCardModal';
import { useConfigTemplateCreationContext } from '@/lib/hooks';
import { AppModalsProvider } from '@/lib/contexts/AppModalsProvider';
import { UserRole, useHasMinRole } from '@/lib/auth';
import type { ResourceName } from '@/lib/constants';
import { useCallback, useState } from 'react';

export type AppLayoutOutletContext = {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

const Main = styled('main')(() => ({
  height: 'calc(100vh - 44px)', // 44px is the height of the toolbar
  flexGrow: 1,
}));

export default function Layout() {
  const inCards = useIsInCards();
  const canEdit = useHasMinRole(UserRole.Editor);
  const isAdmin = useHasMinRole(UserRole.Admin);
  const { templateResource, parentCardKey } =
    useConfigTemplateCreationContext();
  const { modalOpen, openModal, closeModal } = useModals({
    card: false,
    cardTypes: false,
    calculations: false,
    fieldTypes: false,
    graphModels: false,
    graphViews: false,
    linkTypes: false,
    reports: false,
    templates: false,
    workflows: false,
    templateCard: false,
  });
  const key = useOptionalKeyParam();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prevInCards, setPrevInCards] = useState(inCards);

  if (prevInCards !== inCards) {
    setPrevInCards(inCards);
    if (!inCards) setDrawerOpen(false);
  }

  const openCreateResourceModal = useCallback(
    (resourceType: ResourceName) => {
      openModal(resourceType)();
    },
    [openModal],
  );

  return (
    <Stack>
      <AppToolbar
        onCreate={(resourceType) => {
          if (inCards) {
            if (!canEdit) return;
            openModal('card')();
          } else {
            if (!isAdmin) return;
            if (!resourceType) {
              console.warn(
                'No resource type provided when creating a new resource',
              );
              return;
            }
            openModal(resourceType)();
          }
        }}
        onMenuClick={() => setDrawerOpen(true)}
      />
      <AppModalsProvider
        value={{
          openCreateResourceModal,
        }}
      >
        <Main>
          <Outlet
            context={
              { drawerOpen, setDrawerOpen } satisfies AppLayoutOutletContext
            }
          />
        </Main>
      </AppModalsProvider>
      <NewCardModal
        open={modalOpen.card}
        onClose={closeModal('card')}
        cardKey={key}
      />
      <NewFieldTypeModal
        open={modalOpen.fieldTypes}
        onClose={closeModal('fieldTypes')}
      />
      <NewCardTypeModal
        open={modalOpen.cardTypes}
        onClose={closeModal('cardTypes')}
      />
      <NewCalculationModal
        open={modalOpen.calculations}
        onClose={closeModal('calculations')}
      />
      <NewGraphModelModal
        open={modalOpen.graphModels}
        onClose={closeModal('graphModels')}
      />
      <NewGraphViewModal
        open={modalOpen.graphViews}
        onClose={closeModal('graphViews')}
      />
      <NewLinkTypeModal
        open={modalOpen.linkTypes}
        onClose={closeModal('linkTypes')}
      />
      <NewReportModal
        open={modalOpen.reports}
        onClose={closeModal('reports')}
      />
      <NewTemplateModal
        open={modalOpen.templates}
        onClose={closeModal('templates')}
      />
      <NewTemplateCardModal
        open={modalOpen.templateCard}
        onClose={closeModal('templateCard')}
        templateResource={templateResource}
        parentCardKey={parentCardKey}
      />
      <NewWorkflowModal
        open={modalOpen.workflows}
        onClose={closeModal('workflows')}
      />
    </Stack>
  );
}
