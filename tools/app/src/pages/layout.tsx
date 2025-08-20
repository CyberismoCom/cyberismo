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
import { useAppSelector, useOptionalKeyParam } from '@/lib/hooks';
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
import { Snackbar } from '@mui/joy';
import { closeNotification } from '../lib/slices/notifications';
import { removeNotification } from '../lib/slices/notifications';
import { IconButton } from '@mui/joy';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useAppDispatch, useIsInCards } from '../lib/hooks';
import { useModals } from '@/lib/utils';

const Main = styled('main')(() => ({
  height: 'calc(100vh - 44px)', // 44px is the height of the toolbar
  flexGrow: 1,
}));

export default function Layout() {
  const inCards = useIsInCards();
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
  });
  const key = useOptionalKeyParam();

  const dispatch = useAppDispatch();

  const notifications = useAppSelector(
    (state) => state.notifications.notifications,
  );

  return (
    <Stack>
      <AppToolbar
        onCreate={(resourceType) => {
          if (inCards) {
            openModal('card')();
          } else {
            if (!resourceType) {
              console.warn(
                'No resource type provided when creating a new resource',
              );
              return;
            }
            openModal(resourceType)();
          }
        }}
      />
      <Main>
        <Outlet />
      </Main>
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
      <NewWorkflowModal
        open={modalOpen.workflows}
        onClose={closeModal('workflows')}
      />
      {notifications.map((notification, index) => (
        <Snackbar
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          key={notification.id}
          open={!notification.closed}
          sx={{
            marginBottom: index * 9,
          }}
          autoHideDuration={notification.type === 'error' ? 10000 : 4000}
          color={notification.type === 'error' ? 'danger' : 'success'}
          variant="solid"
          onClose={(_, reason) => {
            // If the notification has been closed by clicking away, and it has been less than 2 seconds, don't close it
            if (
              reason === 'clickaway' &&
              notification.createdAt + 2000 >= Date.now()
            ) {
              return;
            }

            dispatch(closeNotification(notification.id));
          }}
          onUnmount={() => {
            dispatch(removeNotification(notification.id));
          }}
          endDecorator={
            <IconButton
              variant="plain"
              size="sm"
              color="neutral"
              onClick={() => {
                dispatch(closeNotification(notification.id));
              }}
            >
              <CloseRounded />
            </IconButton>
          }
        >
          {notification.message}
        </Snackbar>
      ))}
    </Stack>
  );
}
