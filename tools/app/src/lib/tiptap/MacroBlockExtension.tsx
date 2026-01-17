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

import { Node, mergeAttributes, type Attributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Box, Typography } from '@mui/joy';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * React component for rendering a macro block in the editor
 * This component is NON-EDITABLE - it preserves the exact macro source
 */
function MacroBlockComponent({ node, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const [showSource, setShowSource] = useState(false);
  const source = (node.attrs.source as string) || '';
  const macroName = (node.attrs.macroName as string) || 'unknown';
  const renderedHtml = (node.attrs.renderedHtml as string) || '';

  // Format macro name for display
  const displayName = macroName === 'passthrough'
    ? t('visualEditor.passthroughBlock', 'Passthrough Block')
    : t('visualEditor.macroBlockWithName', 'Macro: {{name}}', { name: macroName });

  return (
    <NodeViewWrapper>
      <Box
        contentEditable={false}
        onClick={() => setShowSource(!showSource)}
        sx={{
          position: 'relative',
          border: '2px dashed',
          borderColor: selected ? 'primary.500' : 'primary.300',
          borderRadius: 1,
          my: 2,
          p: 2,
          backgroundColor: selected ? 'primary.50' : 'background.level1',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.500',
            backgroundColor: 'primary.50',
          },
          // Prevent any editing within this block
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Label */}
        <Box
          sx={{
            position: 'absolute',
            top: -12,
            left: 8,
            backgroundColor: 'primary.100',
            color: 'primary.700',
            fontSize: '0.7rem',
            fontWeight: 600,
            px: 1,
            py: 0.25,
            borderRadius: 0.5,
          }}
        >
          {displayName}
        </Box>

        {/* Content - show rendered HTML, source on click, or placeholder */}
        {showSource ? (
          <Box
            component="pre"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              m: 0,
              p: 1,
              backgroundColor: 'background.level2',
              borderRadius: 0.5,
              maxHeight: 300,
              overflow: 'auto',
            }}
          >
            {source}
          </Box>
        ) : renderedHtml ? (
          <Box
            sx={{
              '& table': {
                borderCollapse: 'collapse',
                width: '100%',
              },
              '& th, & td': {
                border: '1px solid',
                borderColor: 'neutral.300',
                p: 1,
                textAlign: 'left',
              },
              '& th': {
                backgroundColor: 'neutral.100',
                fontWeight: 600,
              },
              '& img': {
                maxWidth: '100%',
                height: 'auto',
              },
              '& a': {
                color: 'primary.600',
                textDecoration: 'underline',
              },
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <Typography
            level="body-sm"
            sx={{ color: 'neutral.600', fontStyle: 'italic' }}
          >
            {t('visualEditor.clickToViewSource', 'Click to view source')}
          </Typography>
        )}
      </Box>
    </NodeViewWrapper>
  );
}

/**
 * TipTap extension for Cyberismo macro blocks
 *
 * This extension creates an ATOMIC node that cannot be edited.
 * The macro source is stored exactly as-is and will be serialized
 * back without any modifications.
 *
 * This is the KEY safeguard for macro content integrity.
 */
export const MacroBlock = Node.create({
  name: 'macroBlock',

  // Atomic means it cannot be split or have content edited
  atom: true,

  // Block-level node
  group: 'block',

  // Not selectable as text (only as whole block)
  selectable: true,

  // Cannot be dragged (could corrupt macro)
  draggable: false,

  // Define attributes that store the macro data
  addAttributes() {
    return {
      source: {
        default: '',
        // Parse from data attribute
        parseHTML: (element: HTMLElement) => element.getAttribute('data-source'),
        // Render to data attribute
        renderHTML: (attributes: Attributes) => ({
          'data-source': attributes.source as string,
        }),
      },
      macroName: {
        default: 'unknown',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-macro-name'),
        renderHTML: (attributes: Attributes) => ({
          'data-macro-name': attributes.macroName as string,
        }),
      },
      renderedHtml: {
        default: '',
        // This is set programmatically, not parsed from HTML
        parseHTML: () => '',
        renderHTML: () => ({}),
      },
    };
  },

  // How to parse from HTML (if loading from HTML)
  parseHTML() {
    return [
      {
        tag: 'div[data-type="macro-block"]',
      },
    ];
  },

  // How to render to HTML (for clipboard, etc.)
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'macro-block' }), 0];
  },

  // Use React component for rendering
  addNodeView() {
    return ReactNodeViewRenderer(MacroBlockComponent);
  },
});

export default MacroBlock;
