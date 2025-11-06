/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import {
  Divider,
  Dropdown,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import { asciiDocToolbarActions } from '@/lib/codemirror/actions';
import { useTranslation } from 'react-i18next';
import type { EditorView } from '@codemirror/view';
import {
  Add,
  FormatBold,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  Highlight,
  Redo,
  Undo,
  ViewList,
} from '@mui/icons-material';
import {
  IncludeMacroModal,
  XrefMacroModal,
  ReportMacroModal,
  GraphMacroModal,
  CreateCardsMacroModal,
} from './macro-editors';
import { useModals } from '@/lib/utils';

export interface AsciiDocToolbarProps {
  view: EditorView | null;
  readOnly?: boolean;
  showMacroHelpers?: boolean;
}

export function AsciiDocToolbar({
  view,
  readOnly = false,
  showMacroHelpers = true,
}: AsciiDocToolbarProps) {
  const { t } = useTranslation();

  const { modalOpen, openModal, closeModal } = useModals({
    include: false,
    xref: false,
    createCards: false,
    report: false,
    graph: false,
  });

  return (
    <Stack
      direction="row"
      top={0}
      zIndex={5}
      bgcolor="background.surface"
      position="sticky"
      justifyContent="flex-end"
      gap={1.5}
    >
      <Tooltip title={t('asciiDocEditor.toolbar.undo')}>
        <IconButton onClick={() => asciiDocToolbarActions.undo(view, readOnly)}>
          <Undo color="action" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.redo')}>
        <IconButton onClick={() => asciiDocToolbarActions.redo(view, readOnly)}>
          <Redo color="action" />
        </IconButton>
      </Tooltip>
      <Divider
        orientation="vertical"
        sx={{
          my: 1,
        }}
      />
      {[1, 2, 3].map((level) => (
        <Tooltip
          key={level}
          title={t('asciiDocEditor.toolbar.heading', { level })}
        >
          <IconButton
            onClick={() =>
              asciiDocToolbarActions.heading(view, readOnly, level as 1 | 2 | 3)
            }
          >
            <Typography color="neutral" fontWeight={800}>
              H{level}
            </Typography>
          </IconButton>
        </Tooltip>
      ))}
      <Divider
        orientation="vertical"
        sx={{
          my: 1,
        }}
      />
      <Tooltip title={t('asciiDocEditor.toolbar.bulletedList')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.bulletedList(view, readOnly)}
        >
          <FormatListBulleted color="action" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.numberedList')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.numberedList(view, readOnly)}
        >
          <FormatListNumbered color="action" />
        </IconButton>
      </Tooltip>
      <Divider
        orientation="vertical"
        sx={{
          my: 1,
        }}
      />
      <Tooltip title={t('asciiDocEditor.toolbar.bold')}>
        <IconButton onClick={() => asciiDocToolbarActions.bold(view, readOnly)}>
          <FormatBold color="action" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.italic')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.italic(view, readOnly)}
        >
          <FormatItalic color="action" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.highlight')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.highlight(view, readOnly)}
        >
          <Highlight color="action" />
        </IconButton>
      </Tooltip>
      <Divider
        orientation="vertical"
        sx={{
          my: 1,
        }}
      />
      <Tooltip title={t('asciiDocEditor.toolbar.insertTable')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.table(view, readOnly)}
        >
          <ViewList color="action" />
        </IconButton>
      </Tooltip>
      <Divider
        orientation="vertical"
        sx={{
          my: 1,
        }}
      />
      {showMacroHelpers && (
        <>
          <Dropdown>
            <MenuButton
              variant="soft"
              color="primary"
              size="sm"
              disabled={readOnly}
              sx={{
                py: 0,
                px: 0.75,
              }}
            >
              <Add fontSize="medium" />
            </MenuButton>
            <Menu>
              <MenuItem onClick={openModal('include')}>
                {t('asciiDocEditor.toolbar.macros.include')}
              </MenuItem>
              <MenuItem onClick={openModal('xref')}>
                {t('asciiDocEditor.toolbar.macros.xref')}
              </MenuItem>
              <MenuItem onClick={openModal('createCards')}>
                {t('asciiDocEditor.toolbar.macros.createCards')}
              </MenuItem>
              <MenuItem onClick={openModal('report')}>
                {t('asciiDocEditor.toolbar.macros.report')}
              </MenuItem>
              <MenuItem onClick={openModal('graph')}>
                {t('asciiDocEditor.toolbar.macros.graph')}
              </MenuItem>
            </Menu>
          </Dropdown>
          <IncludeMacroModal
            open={modalOpen.include}
            onClose={closeModal('include')}
            onInsert={(options) =>
              asciiDocToolbarActions.insertMacro(
                view,
                readOnly,
                'include',
                options,
              )
            }
          />
          <XrefMacroModal
            open={modalOpen.xref}
            onClose={closeModal('xref')}
            onInsert={(options) =>
              asciiDocToolbarActions.insertMacro(
                view,
                readOnly,
                'xref',
                options,
                {
                  newLine: false,
                },
              )
            }
          />
          <CreateCardsMacroModal
            open={modalOpen.createCards}
            onClose={closeModal('createCards')}
            onInsert={(options) =>
              asciiDocToolbarActions.insertMacro(
                view,
                readOnly,
                'createCards',
                options,
              )
            }
          />
          <ReportMacroModal
            open={modalOpen.report}
            onClose={closeModal('report')}
            onInsert={(options) =>
              asciiDocToolbarActions.insertMacro(
                view,
                readOnly,
                'report',
                options,
              )
            }
          />
          <GraphMacroModal
            open={modalOpen.graph}
            onClose={closeModal('graph')}
            onInsert={(options) =>
              asciiDocToolbarActions.insertMacro(
                view,
                readOnly,
                'graph',
                options,
              )
            }
          />
        </>
      )}
    </Stack>
  );
}

export default AsciiDocToolbar;
