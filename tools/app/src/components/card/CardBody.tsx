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

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import { UserRole, useHasMinRole } from '@/lib/auth';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';

import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { useIsDarkMode } from '@/lib/hooks/theme';
import { isEdited } from '@/lib/slices/pageState';
import { addNotification } from '@/lib/slices/notifications';

import { renderCardHtml } from '@/components/card/renderCardContent';
import type { CardResponse } from '@/lib/api/types';
import type { CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';
import {
  addAttachment,
  handleAttachmentDrop,
  useSaveKeymap,
} from '@/lib/codemirror';
import AsciiDocToolbar from '@/components/AsciiDocToolbar';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView, lineNumbers } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';
import { CODE_MIRROR_BASE_PROPS, CODE_MIRROR_THEMES } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import { parseContent } from '@/lib/api/actions/card.js';

const editorExtensions = [
  StreamLanguage.define(asciidoc),
  EditorView.lineWrapping,
  lineNumbers(),
];

type CardBodyProps = {
  card: CardResponse;
  preview?: boolean;
  onContentSave?: (content: string) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
};

export type CardBodyHandle = {
  insertAttachment: (attachment: CardAttachment) => void;
  enterEdit: () => void;
};

export const CardBody = forwardRef<CardBodyHandle, CardBodyProps>(
  function CardBody({ card, preview, onContentSave, onEditingChange }, ref) {
    const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null);

    const lastTitle = useAppSelector((state) => state.page.title);
    const cardKey = useAppSelector((state) => state.page.cardKey);
    const isEditedValue = useAppSelector((state) => state.page.isEdited);

    const dispatch = useAppDispatch();
    const { t } = useTranslation();
    const isDarkMode = useIsDarkMode();
    const canEditRole = useHasMinRole(UserRole.Editor);

    // Inline editing state
    const [editing, setEditing] = useState(false);
    const editContentRef = useRef(card.rawContent || '');
    const [cmView, setCmView] = useState<EditorView | null>(null);
    const [cmEditor, setCmEditor] = useState<HTMLDivElement | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);

    const canEdit = !preview && !!onContentSave && canEditRole;

    useEffect(() => {
      onEditingChange?.(editing);
    }, [editing, onEditingChange]);

    useImperativeHandle(
      ref,
      () => ({
        insertAttachment: (attachment: CardAttachment) => {
          if (!cmView) return;
          addAttachment(cmView, attachment, card.key);
        },
        enterEdit: () => {
          if (!canEdit) return;
          if (editing) return;
          editContentRef.current = card.rawContent || '';
          setEditing(true);
        },
      }),
      [cmView, card.key, canEdit, editing, card.rawContent],
    );

    const setCmRef = useCallback((cmRef: ReactCodeMirrorRef) => {
      if (!cmRef?.view || !cmRef?.editor) {
        setCmView(null);
        setCmEditor(null);
        return;
      }
      setCmView(cmRef.view);
      setCmEditor(cmRef.editor as HTMLDivElement);
    }, []);

    const handleEditButtonClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canEdit) return;
      editContentRef.current = card.rawContent || '';
      setEditing(true);
    };

    const handleSave = async () => {
      if (!onContentSave) return;
      try {
        await onContentSave(editContentRef.current);
        setEditing(false);
        setPreviewing(false);
        setPreviewHtml(null);
        dispatch(isEdited(false));
      } catch (error) {
        dispatch(
          addNotification({
            message: error instanceof Error ? error.message : '',
            type: 'error',
          }),
        );
      }
    };

    const handleCancel = () => {
      editContentRef.current = card.rawContent || '';
      setEditing(false);
      setPreviewing(false);
      setPreviewHtml(null);
      dispatch(isEdited(false));
    };

    const handleTogglePreview = async () => {
      if (previewing) {
        setPreviewing(false);
        setPreviewHtml(null);
        return;
      }
      setPreviewing(true);
      setPreviewHtml(null);
      try {
        const html = await parseContent(card.key, editContentRef.current);
        setPreviewHtml(html);
      } catch {
        setPreviewing(false);
        dispatch(addNotification({ message: t('error'), type: 'error' }));
      }
    };

    // Cmd/Ctrl+S (and Cmd/Ctrl+Enter) saves; Escape cancels — scoped to the
    // CodeMirror editor.
    const saveExtension = useSaveKeymap(cmView, {
      onSave: handleSave,
      onCancel: handleCancel,
    });
    const editorExtensionsWithSave = useMemo(
      () => [...editorExtensions, saveExtension],
      [saveExtension],
    );

    // scroll to last title on first render and when tab is changed
    useEffect(() => {
      if (lastTitle && contentRef && cardKey === card?.key) {
        const header = document.getElementById(lastTitle);
        if (header) {
          header.scrollIntoView();
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentRef]);

    const setRef = useCallback((node: HTMLDivElement | null) => {
      setContentRef(node);
    }, []);

    const htmlContent = card.parsedContent || '';

    const renderHtml = (html: string) =>
      renderCardHtml(html, {
        macroKey: card.key,
        preview,
        downloadName: card.title,
      });

    const parsedContent = renderHtml(htmlContent);
    const isEmpty = !htmlContent.trim();

    return (
      <>
        {editing ? (
          <Box
            border="1px solid"
            borderColor="primary.outlinedBorder"
            borderRadius={6}
            padding={{ xs: 1, sm: 1.5 }}
            sx={{
              '& .cm-gutters': {
                bgcolor: 'background.level1',
              },
            }}
          >
            <Stack spacing={1}>
              <Box
                sx={{
                  display: 'grid',
                  columnGap: 1,
                  rowGap: 1,
                  alignItems: 'center',
                  gridTemplateColumns: 'auto 1fr auto',
                  gridTemplateAreas: {
                    xs: '"preview . actions" "toolbar toolbar toolbar"',
                    xl: '"preview toolbar actions"',
                  },
                }}
              >
                <Box sx={{ gridArea: 'preview' }}>
                  <Tooltip title={previewing ? t('edit') : t('preview')}>
                    <IconButton
                      data-cy="contentPreviewButton"
                      size="sm"
                      variant={previewing ? 'solid' : 'soft'}
                      color="primary"
                      onClick={handleTogglePreview}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ gridArea: 'toolbar', minWidth: 0 }}>
                  <AsciiDocToolbar view={cmView} />
                </Box>
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ gridArea: 'actions', justifySelf: 'end' }}
                >
                  <Button
                    size="sm"
                    variant="plain"
                    color="neutral"
                    data-cy="contentCancelButton"
                    onClick={handleCancel}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    color="primary"
                    data-cy="contentSaveButton"
                    startDecorator={<EditIcon />}
                    onClick={handleSave}
                  >
                    {t('save')}
                  </Button>
                </Stack>
              </Box>
              {previewing ? (
                <Box
                  maxHeight="calc(100vh - 250px)"
                  overflow="auto"
                  padding={1}
                >
                  {previewHtml === null ? (
                    <Stack alignItems="center" padding={4}>
                      <CircularProgress size="sm" />
                    </Stack>
                  ) : (
                    <div className="doc">{renderHtml(previewHtml)}</div>
                  )}
                </Box>
              ) : (
                <CodeMirror
                  {...CODE_MIRROR_BASE_PROPS}
                  ref={setCmRef}
                  maxHeight="calc(100vh - 250px)"
                  theme={
                    isDarkMode
                      ? CODE_MIRROR_THEMES.dark
                      : CODE_MIRROR_THEMES.light
                  }
                  extensions={editorExtensionsWithSave}
                  value={editContentRef.current}
                  onDrop={(e) =>
                    handleAttachmentDrop(
                      e,
                      cmView,
                      cmEditor,
                      card.attachments,
                      card.key,
                    )
                  }
                  onChange={(value: string) => {
                    if (!isEditedValue) {
                      dispatch(isEdited(true));
                    }
                    editContentRef.current = value;
                  }}
                />
              )}
            </Stack>
          </Box>
        ) : (
          <Box
            border="1px solid"
            borderColor="neutral.outlinedBorder"
            borderRadius={6}
            padding={{ xs: 1, sm: 1.5 }}
            position="relative"
            minHeight={56}
            sx={
              canEdit
                ? {
                    '&:hover .edit-icon-button': {
                      opacity: 1,
                    },
                  }
                : undefined
            }
          >
            {canEdit && (
              <Box
                sx={{
                  position: 'sticky',
                  top: 8,
                  height: 0,
                  zIndex: 20,
                }}
              >
                <IconButton
                  className="edit-icon-button"
                  data-cy="editBodyButton"
                  size="sm"
                  variant="soft"
                  color="primary"
                  onClick={handleEditButtonClick}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    opacity: isEmpty ? 1 : { xs: 1, md: 0 },
                    transition: 'opacity 0.15s',
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
            {isEmpty ? (
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {t('emptyCardBody')}
              </Typography>
            ) : (
              <div
                className={canEdit ? 'doc doc--editable' : 'doc'}
                ref={setRef}
              >
                {parsedContent}
              </div>
            )}
          </Box>
        )}
      </>
    );
  },
);
