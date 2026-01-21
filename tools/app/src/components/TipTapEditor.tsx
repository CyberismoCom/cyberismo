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

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Box, Stack, Divider, IconButton, Tooltip, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import {
  FormatBold,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  Highlight as HighlightIcon,
  Redo,
  Undo,
  Code,
  FormatQuote,
  HorizontalRule,
} from '@mui/icons-material';

import { parseAsciidoc, serializeAsciidoc, MacroBlock, Admonition } from '@/lib/tiptap';

export interface TipTapEditorProps {
  content: string;
  cardKey: string;
  contentRef: MutableRefObject<string>;
  onContentChange: () => void;
  readOnly?: boolean;
  /** Rendered HTML content for displaying macro outputs */
  renderedHtml?: string | null;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  readOnly?: boolean;
}

/**
 * Toolbar button component - defined outside to avoid recreation
 */
function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
  readOnly = false,
}: ToolbarButtonProps) {
  return (
    <Tooltip title={title}>
      <IconButton
        onClick={onClick}
        disabled={disabled || readOnly}
        variant={isActive ? 'soft' : 'plain'}
        color={isActive ? 'primary' : 'neutral'}
        size="sm"
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

interface EditorToolbarProps {
  editor: Editor | null;
  readOnly?: boolean;
}

/**
 * Toolbar component for the TipTap editor
 */
function EditorToolbar({ editor, readOnly = false }: EditorToolbarProps) {
  const { t } = useTranslation();

  if (!editor) return null;

  return (
    <Stack
      direction="row"
      top={0}
      zIndex={5}
      bgcolor="background.surface"
      position="sticky"
      justifyContent="flex-start"
      alignItems="center"
      gap={0.5}
      p={0.5}
      flexWrap="wrap"
    >
      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={t('asciiDocEditor.toolbar.undo')}
        readOnly={readOnly}
      >
        <Undo fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={t('asciiDocEditor.toolbar.redo')}
        readOnly={readOnly}
      >
        <Redo fontSize="small" />
      </ToolbarButton>

      <Divider orientation="vertical" sx={{ mx: 0.5, height: 24 }} />

      {/* Headings */}
      {[1, 2, 3].map((level) => (
        <ToolbarButton
          key={level}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
          }
          isActive={editor.isActive('heading', { level })}
          title={t('asciiDocEditor.toolbar.heading', { level })}
          readOnly={readOnly}
        >
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              lineHeight: 1,
            }}
          >
            H{level}
          </Typography>
        </ToolbarButton>
      ))}

      <Divider orientation="vertical" sx={{ mx: 0.5, height: 24 }} />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title={t('asciiDocEditor.toolbar.bold')}
        readOnly={readOnly}
      >
        <FormatBold fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title={t('asciiDocEditor.toolbar.italic')}
        readOnly={readOnly}
      >
        <FormatItalic fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title={t('visualEditor.toolbar.monospace')}
        readOnly={readOnly}
      >
        <Code fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        title={t('asciiDocEditor.toolbar.highlight')}
        readOnly={readOnly}
      >
        <HighlightIcon fontSize="small" />
      </ToolbarButton>

      <Divider orientation="vertical" sx={{ mx: 0.5, height: 24 }} />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title={t('asciiDocEditor.toolbar.bulletedList')}
        readOnly={readOnly}
      >
        <FormatListBulleted fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title={t('asciiDocEditor.toolbar.numberedList')}
        readOnly={readOnly}
      >
        <FormatListNumbered fontSize="small" />
      </ToolbarButton>

      <Divider orientation="vertical" sx={{ mx: 0.5, height: 24 }} />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title={t('visualEditor.toolbar.blockquote')}
        readOnly={readOnly}
      >
        <FormatQuote fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title={t('visualEditor.toolbar.codeBlock')}
        readOnly={readOnly}
      >
        <Code fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title={t('visualEditor.toolbar.horizontalRule')}
        readOnly={readOnly}
      >
        <HorizontalRule fontSize="small" />
      </ToolbarButton>
    </Stack>
  );
}

/**
 * TipTap-based Visual Editor for AsciiDoc content
 *
 * This editor uses AsciiDoc as the backing format, ensuring:
 * - All content is stored and serialized as AsciiDoc
 * - Cyberismo macros are preserved exactly as-is (atomic, non-editable blocks)
 * - No lossy HTML conversion
 */
export function TipTapEditor({
  content,
  contentRef,
  onContentChange,
  readOnly = false,
  renderedHtml,
}: TipTapEditorProps) {
  const { t } = useTranslation();

  // Use a ref to track the initial content to avoid re-parsing on every render
  const initialContentRef = useRef<string | null>(null);
  // Track if editor has been initialized to skip the first onUpdate
  const isInitializedRef = useRef(false);

  // Initialize the editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable some features we handle differently
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: false, // Disable auto-linking to prevent xref: links from being modified
        linkOnPaste: false, // Disable auto-link on paste
        protocols: ['http', 'https', 'mailto', 'xref'], // Allow xref: protocol
        HTMLAttributes: {
          class: 'tiptap-link',
        },
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: {
          class: 'tiptap-image',
        },
      }),
      Highlight.configure({
        multicolor: false,
      }),
      Placeholder.configure({
        placeholder: t('visualEditor.placeholder'),
      }),
      // Custom extensions
      MacroBlock,
      Admonition,
    ],
    content: parseAsciidoc(content, renderedHtml),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      // Skip the first update that fires during initialization
      if (!isInitializedRef.current) {
        return;
      }
      // Serialize back to AsciiDoc and update contentRef
      const asciidoc = serializeAsciidoc(ed.getJSON());
      contentRef.current = asciidoc;
      onContentChange();
    },
    // Mark editor as initialized after first render
    onCreate: () => {
      initialContentRef.current = content;
      // Use setTimeout to ensure we skip the initial onUpdate but catch subsequent ones
      setTimeout(() => {
        isInitializedRef.current = true;
      }, 0);
    },
  });

  // Update editor content when external content changes (e.g., from backend)
  useEffect(() => {
    if (editor && initialContentRef.current !== content && content !== contentRef.current) {
      // Temporarily disable updates while setting content programmatically
      const wasInitialized = isInitializedRef.current;
      isInitializedRef.current = false;
      
      const newContent = parseAsciidoc(content, renderedHtml);
      editor.commands.setContent(newContent);
      initialContentRef.current = content;
      
      // Re-enable updates after a tick
      setTimeout(() => {
        isInitializedRef.current = wasInitialized;
      }, 0);
    }
  }, [content, editor, contentRef, renderedHtml]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  return (
    <Stack height="100%" sx={{ overflow: 'hidden' }}>
      <EditorToolbar editor={editor} readOnly={readOnly} />
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          p: 2,
          '& .tiptap': {
            outline: 'none',
            minHeight: '100%',
            // Typography styles matching the doc class
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              fontWeight: 600,
              lineHeight: 1.3,
              mt: 2,
              mb: 1,
            },
            '& h1': { fontSize: '2rem' },
            '& h2': { fontSize: '1.5rem' },
            '& h3': { fontSize: '1.25rem' },
            '& h4': { fontSize: '1.1rem' },
            '& h5': { fontSize: '1rem' },
            '& h6': { fontSize: '0.9rem' },
            '& p': {
              my: 1,
            },
            '& ul, & ol': {
              pl: 3,
              my: 1,
            },
            '& li': {
              my: 0.5,
            },
            '& blockquote': {
              borderLeft: '3px solid',
              borderColor: 'neutral.300',
              pl: 2,
              ml: 0,
              color: 'neutral.600',
              fontStyle: 'italic',
            },
            '& pre': {
              backgroundColor: 'neutral.100',
              borderRadius: 1,
              p: 2,
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              overflow: 'auto',
            },
            '& code': {
              backgroundColor: 'neutral.100',
              borderRadius: 0.5,
              px: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.9em',
            },
            '& pre code': {
              backgroundColor: 'transparent',
              p: 0,
            },
            '& hr': {
              border: 'none',
              borderTop: '1px solid',
              borderColor: 'neutral.300',
              my: 2,
            },
            '& a, & .tiptap-link': {
              color: 'primary.600',
              textDecoration: 'underline',
              cursor: 'pointer',
            },
            '& img, & .tiptap-image': {
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 1,
            },
            '& mark': {
              backgroundColor: 'warning.200',
              borderRadius: 0.25,
              px: 0.25,
            },
            // Admonition styles
            '& .admonition': {
              border: '1px solid',
              borderRadius: 1,
              p: 2,
              my: 2,
              '&.admonition-note': {
                borderColor: 'primary.300',
                backgroundColor: 'primary.50',
              },
              '&.admonition-tip': {
                borderColor: 'success.300',
                backgroundColor: 'success.50',
              },
              '&.admonition-warning': {
                borderColor: 'warning.300',
                backgroundColor: 'warning.50',
              },
              '&.admonition-caution': {
                borderColor: 'danger.300',
                backgroundColor: 'danger.50',
              },
              '&.admonition-important': {
                borderColor: 'danger.300',
                backgroundColor: 'danger.50',
              },
            },
            // Placeholder
            '& p.is-editor-empty:first-child::before': {
              color: 'neutral.400',
              content: 'attr(data-placeholder)',
              float: 'left',
              height: 0,
              pointerEvents: 'none',
            },
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Stack>
  );
}

export default TipTapEditor;
