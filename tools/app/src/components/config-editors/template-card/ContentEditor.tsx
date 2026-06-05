/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { Box, Button, Stack } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView, lineNumbers } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';
import AsciiDocToolbar from '@/components/AsciiDocToolbar';
import { addAttachment, handleAttachmentDrop } from '@/lib/codemirror';
import { useIsDarkMode } from '@/lib/hooks';
import { CODE_MIRROR_BASE_PROPS, CODE_MIRROR_THEMES } from '@/lib/constants';
import type { CardResponse } from '@/lib/api/types';

const extensions = [
  StreamLanguage.define(asciidoc),
  EditorView.lineWrapping,
  lineNumbers(),
];

type Attachment = CardResponse['attachments'][number];

export type ContentEditorHandle = {
  insertAttachment: (attachment: Attachment) => void;
};

export const ContentEditor = forwardRef<
  ContentEditorHandle,
  {
    value: string;
    editable: boolean;
    dirty: boolean;
    cardKey: string;
    attachments: Attachment[];
    onChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
  }
>(function ContentEditor(
  { value, editable, dirty, cardKey, attachments, onChange, onSave, onCancel },
  ref,
) {
  const { t } = useTranslation();
  const isDarkMode = useIsDarkMode();
  const [view, setView] = useState<EditorView | null>(null);
  const [editor, setEditor] = useState<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      insertAttachment: (attachment: Attachment) => {
        if (view) addAttachment(view, attachment, cardKey);
      },
    }),
    [view, cardKey],
  );

  const setCmRef = useCallback((cmRef: ReactCodeMirrorRef) => {
    if (!cmRef?.view || !cmRef?.editor) {
      setView(null);
      setEditor(null);
      return;
    }
    setView(cmRef.view);
    setEditor(cmRef.editor as HTMLDivElement);
  }, []);

  return (
    <Box
      data-cy="contentEditor"
      border="1px solid"
      borderColor={dirty ? 'primary.outlinedBorder' : 'neutral.outlinedBorder'}
      borderRadius={6}
      padding={{ xs: 1, sm: 1.5 }}
      sx={{ '& .cm-gutters': { bgcolor: 'background.level1' } }}
    >
      <Stack spacing={1}>
        {editable && <AsciiDocToolbar view={view} />}
        <CodeMirror
          {...CODE_MIRROR_BASE_PROPS}
          ref={setCmRef}
          theme={
            isDarkMode ? CODE_MIRROR_THEMES.dark : CODE_MIRROR_THEMES.light
          }
          extensions={extensions}
          value={value}
          editable={editable}
          readOnly={!editable}
          onChange={onChange}
          onDrop={(e) =>
            handleAttachmentDrop(e, view, editor, attachments, cardKey)
          }
        />
        {editable && (
          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
            <Button
              size="sm"
              variant="plain"
              color="neutral"
              data-cy="contentCancelButton"
              disabled={!dirty}
              onClick={onCancel}
            >
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              variant="soft"
              color="primary"
              data-cy="contentSaveButton"
              disabled={!dirty}
              onClick={onSave}
            >
              {t('save')}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
});
