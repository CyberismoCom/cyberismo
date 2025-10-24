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

import { Divider, IconButton, Stack, Tooltip, Typography } from '@mui/joy';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HighlightIcon from '@mui/icons-material/Highlight';
import ViewListIcon from '@mui/icons-material/ViewList';
import { asciiDocToolbarActions } from '@/lib/codemirror/actions';
import { useTranslation } from 'react-i18next';
import type { EditorView } from '@codemirror/view';

export interface AsciiDocToolbarProps {
  view: EditorView | null;
  readOnly?: boolean;
}

export function AsciiDocToolbar({ view, readOnly }: AsciiDocToolbarProps) {
  const { t } = useTranslation();

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
          <UndoIcon color="action" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.redo')}>
        <IconButton onClick={() => asciiDocToolbarActions.redo(view, readOnly)}>
          <RedoIcon color="action" />
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
              asciiDocToolbarActions.heading(view, level as 1 | 2 | 3, readOnly)
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
          <FormatListBulletedIcon color="action" />
        </IconButton>
      </Tooltip>

      <Tooltip title={t('asciiDocEditor.toolbar.numberedList')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.numberedList(view, readOnly)}
        >
          <FormatListNumberedIcon color="action" />
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
          <FormatBoldIcon color="action" />
        </IconButton>
      </Tooltip>

      <Tooltip title={t('asciiDocEditor.toolbar.italic')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.italic(view, readOnly)}
        >
          <FormatItalicIcon color="action" />
        </IconButton>
      </Tooltip>

      <Tooltip title={t('asciiDocEditor.toolbar.highlight')}>
        <IconButton
          onClick={() => asciiDocToolbarActions.highlight(view, readOnly)}
        >
          <HighlightIcon color="action" />
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
          <ViewListIcon color="action" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export default AsciiDocToolbar;
