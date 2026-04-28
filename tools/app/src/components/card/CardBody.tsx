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

import type { ReactElement } from 'react';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
} from '@mui/joy';
import { renderToStaticMarkup } from 'react-dom/server';
import { getConfig, parseDataAttributes } from '@/lib/utils';
import { useLocation } from 'react-router';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CheckBox from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';

import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { useIsDarkMode } from '@/lib/hooks/theme';
import { isEdited } from '@/lib/slices/pageState';
import { addNotification } from '@/lib/slices/notifications';

import createDOMPurify from 'dompurify';
import type { MacroMetadata } from '@cyberismo/data-handler/interfaces/macros';
import { macroMetadata } from '@cyberismo/data-handler/macros/common';
import type { UIMacroName } from '@/components/macros';
import { macros as UImacros } from '@/components/macros';
import parseReact, { domToReact } from 'html-react-parser';
import type { DOMNode } from 'html-react-parser';
import type { CardResponse } from '@/lib/api/types';
import type { CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';
import { addAttachment, handleAttachmentDrop } from '@/lib/codemirror';
import SvgViewerModal from '@/components/modals/svgViewerModal';
import { SafeRouterLink } from '@/components/SafeRouterLink';
import AsciiDocToolbar from '@/components/AsciiDocToolbar';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView, lineNumbers } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';
import { CODE_MIRROR_BASE_PROPS, CODE_MIRROR_THEMES } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import { parseContent } from '@/lib/api/actions/card.js';

interface HTMLElementWithCleanup extends HTMLElement {
  __cleanupSvgControls?: () => void;
}

// Derive allowed macro tags from the frontend macro definitions so they survive sanitization
const MACRO_TAGS = Object.values(macroMetadata)
  .map((meta) => meta.tagName.toUpperCase())
  .filter(Boolean) as string[];

const contentPurify = createDOMPurify(window);
contentPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IFRAME') {
    node.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  }
});

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

    // Inline editing state
    const [editing, setEditing] = useState(false);
    const editContentRef = useRef(card.rawContent || '');
    const [cmView, setCmView] = useState<EditorView | null>(null);
    const [cmEditor, setCmEditor] = useState<HTMLDivElement | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);

    const canEdit = !preview && !!onContentSave && !getConfig().staticMode;

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

    const handleStartEdit = (e: React.MouseEvent) => {
      if (!canEdit) return;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, select, textarea, [role="button"]'))
        return;
      editContentRef.current = card.rawContent || '';
      setEditing(true);
    };

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

    useEffect(() => {
      if (!editing) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.key === 's' || e.key === 'Enter') && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          handleCancel();
        }
      };
      document.addEventListener('keydown', handleKeyDown, true);
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing, onContentSave]);

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

    const [modalSvg, setModalSvg] = useState<string>('');
    const [isModalOpen, setModalOpen] = useState(false);

    const fullScreenIcon = renderToStaticMarkup(<OpenInFullIcon />);
    const downloadIcon = renderToStaticMarkup(<DownloadIcon />);

    const makeIconButton = (icon: string, aria: string) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', aria);
      Object.assign(btn.style, {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      } as CSSStyleDeclaration);
      btn.innerHTML = icon;
      return btn;
    };

    const handleFullScreen = (htmlElementWithSVG: HTMLElement) => {
      const svgEl = htmlElementWithSVG.querySelector<SVGSVGElement>('svg');
      if (!svgEl) return;

      const xml = new XMLSerializer().serializeToString(svgEl);
      const svgWithNs = xml.match(/^<svg[^>]+xmlns=/)
        ? xml
        : xml.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');

      setModalSvg(svgWithNs);
      setModalOpen(true);
    };

    const handleDownload = (htmlElementWithSVG: HTMLElement) => {
      const svgEl = htmlElementWithSVG.querySelector<SVGSVGElement>('svg');
      if (!svgEl) return;

      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgEl);
      if (!source.match(/^<svg[^>]+xmlns=/)) {
        source = source.replace(
          /^<svg/,
          '<svg xmlns="http://www.w3.org/2000/svg"',
        );
      }

      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = (svgEl.id || card.title) + ' diagram.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    };

    useEffect(() => {
      if (!contentRef) return;

      const wrappers: NodeListOf<HTMLElement> =
        contentRef.querySelectorAll<HTMLElement>(
          '[data-type="cyberismo-svg-wrapper"]',
        );

      wrappers.forEach((wrapper) => {
        if (wrapper.querySelector('[data-cy="svg-controls"]')) return;

        if (wrapper.style.paddingTop === '') wrapper.style.paddingTop = '48px';
        if (wrapper.style.position === '') wrapper.style.position = 'relative';

        const controls = document.createElement('div');
        controls.setAttribute('data-cy', 'svg-controls');
        Object.assign(controls.style, {
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          gap: '6px',
          zIndex: 10,
        } as unknown as CSSStyleDeclaration);

        /* ---------- Buttons ---------- */
        const fullScreenBtn = makeIconButton(fullScreenIcon, 'fullscreen');
        const downloadBtn = makeIconButton(downloadIcon, 'download');

        const handleFullScreenClick = () => handleFullScreen(wrapper);
        const handleDownloadClick = () => handleDownload(wrapper);

        fullScreenBtn.addEventListener('click', handleFullScreenClick);
        downloadBtn.addEventListener('click', handleDownloadClick);

        controls.appendChild(fullScreenBtn);
        controls.appendChild(downloadBtn);
        wrapper.appendChild(controls);

        /* ---------- Cleanup for this wrapper ---------- */
        const cleanup = () => {
          fullScreenBtn.removeEventListener('click', handleFullScreenClick);
          downloadBtn.removeEventListener('click', handleDownloadClick);
          wrapper.querySelector('[data-cy="svg-controls"]')?.remove();
        };
        (wrapper as HTMLElementWithCleanup).__cleanupSvgControls = cleanup;
      });

      /* ---------- Global cleanup on effect teardown ---------- */
      return () => {
        wrappers.forEach((wrapper) => {
          (wrapper as HTMLElementWithCleanup).__cleanupSvgControls?.();
          delete (wrapper as HTMLElementWithCleanup).__cleanupSvgControls;
        });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentRef, useLocation().key]);

    const setRef = useCallback((node: HTMLDivElement | null) => {
      setContentRef(node);
    }, []);

    const htmlContent = card.parsedContent || '';

    const sanitizeOptions = {
      USE_PROFILES: { html: true, svg: true },
      ADD_TAGS: [...MACRO_TAGS, 'iframe'],
      ADD_ATTR: [
        'options',
        'key',
        'sandbox',
        'allow',
        'allowfullscreen',
        'frameborder',
      ],
    };

    const combinedMacros = Object.entries(macroMetadata).reduce<
      // We simply trust that the macro has been validated
      // If a validation error occurs, it should also not try to render
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (MacroMetadata & { component: (props: any) => ReactElement })[]
    >((acc, [key, value]) => {
      acc.push({
        ...value,
        component: UImacros[key as UIMacroName] ?? (() => <>err</>),
      });
      return acc;
    }, []);

    // NOTE: Parser is case-insensitive and lower cases all tags and attributes
    // htmlparser2 options cannot be used on the browser
    const replaceNode = (node: DOMNode) => {
      if (node.type === 'tag') {
        if (node.name === 'a') {
          const href = node.attribs?.href;
          if (href?.startsWith('/cards/')) {
            return (
              <SafeRouterLink to={href}>
                {domToReact(node.children as DOMNode[])}
              </SafeRouterLink>
            );
          }
        }
        if (node.name === 'i') {
          const checkboxSx = {
            fontSize: '1.25rem',
            verticalAlign: 'middle',
          };
          const className = node.attribs?.class ?? '';
          if (className.includes('fa-check-square-o')) {
            return <CheckBox color="primary" sx={checkboxSx} />;
          }
          if (className.includes('fa-square-o')) {
            return (
              <CheckBoxOutlineBlank
                sx={{ ...checkboxSx, color: 'text.tertiary' }}
              />
            );
          }
        }
        const macro = combinedMacros.find((m) => m.tagName === node.name);
        if (macro) {
          const attributes = parseDataAttributes(node.attribs);
          return React.createElement(macro.component, {
            ...attributes,
            macroKey: card.key,
            preview,
          });
        }
      }
    };

    const renderHtml = (html: string) =>
      parseReact(contentPurify.sanitize(html, sanitizeOptions), {
        replace: replaceNode,
      });

    const parsedContent = renderHtml(htmlContent);

    return (
      <>
        <SvgViewerModal
          open={isModalOpen}
          svgMarkup={modalSvg}
          onClose={() => setModalOpen(false)}
        />
        {editing ? (
          <Box
            border="1px solid"
            borderColor="primary.outlinedBorder"
            borderRadius={6}
            padding={2}
            sx={{
              '& .cm-gutters': {
                bgcolor: 'background.level1',
              },
            }}
          >
            <Stack spacing={1}>
              <Stack
                direction="row"
                spacing={0.5}
                justifyContent="space-between"
                alignItems="center"
              >
                <Stack direction="row" spacing={0.5} alignItems="center">
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
                  <AsciiDocToolbar view={cmView} />
                </Stack>
                <Stack direction="row" spacing={0.5}>
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
              </Stack>
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
                  extensions={editorExtensions}
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
            padding={2}
            position="relative"
            onClick={handleStartEdit}
            sx={
              canEdit
                ? {
                    cursor: 'pointer',
                    '&:hover': {
                      borderColor: 'primary.outlinedBorder',
                    },
                    '&:hover .edit-icon-button': {
                      opacity: 1,
                    },
                  }
                : undefined
            }
          >
            {canEdit && (
              <IconButton
                className="edit-icon-button"
                data-cy="editBodyButton"
                size="sm"
                variant="soft"
                color="primary"
                onClick={handleEditButtonClick}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  opacity: 0,
                  transition: 'opacity 0.15s',
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
            <div className="doc" ref={setRef}>
              {parsedContent}
            </div>
          </Box>
        )}
      </>
    );
  },
);
