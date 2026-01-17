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

import React, {
  useCallback,
  useRef,
  useState,
  useMemo,
  type MutableRefObject,
} from 'react';
import { Box, Stack, Divider, IconButton, Tooltip, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import {
  FormatBold,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  Highlight,
  Redo,
  Undo,
} from '@mui/icons-material';
import type { ReactElement } from 'react';
import parseReact from 'html-react-parser';

import type { MacroMetadata } from '@cyberismo/data-handler/interfaces/macros';
import { macroMetadata } from '@cyberismo/data-handler/macros/common';
import type { UIMacroName } from './macros';
import { macros as UImacros } from './macros';
import { parseDataAttributes } from '@/lib/utils';
import { htmlToAsciidoc } from '../lib/htmlToAsciidoc';
import {
  extractMacros,
  restoreMacrosFromPlaceholders,
  type ExtractedMacro,
} from '../lib/macroUtils';

export interface VisualEditorProps {
  htmlContent: string;
  rawContent: string;
  cardKey: string;
  contentRef: MutableRefObject<string>;
  onContentChange: () => void;
  readOnly?: boolean;
}

/**
 * Visual editor toolbar for basic formatting
 */
function VisualEditorToolbar({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation();

  const execCommand = (command: string, value?: string) => {
    if (readOnly) return;
    document.execCommand(command, false, value);
  };

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
        <IconButton onClick={() => execCommand('undo')} disabled={readOnly}>
          <Undo color={readOnly ? 'disabled' : 'action'} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.redo')}>
        <IconButton onClick={() => execCommand('redo')} disabled={readOnly}>
          <Redo color={readOnly ? 'disabled' : 'action'} />
        </IconButton>
      </Tooltip>
      <Divider orientation="vertical" sx={{ my: 1 }} />
      {[1, 2, 3].map((level) => (
        <Tooltip
          key={level}
          title={t('asciiDocEditor.toolbar.heading', { level })}
        >
          <IconButton
            onClick={() => execCommand('formatBlock', `h${level}`)}
            disabled={readOnly}
          >
            <Typography
              color="neutral"
              fontWeight={800}
              sx={{ opacity: readOnly ? 0.5 : 1 }}
            >
              H{level}
            </Typography>
          </IconButton>
        </Tooltip>
      ))}
      <Divider orientation="vertical" sx={{ my: 1 }} />
      <Tooltip title={t('asciiDocEditor.toolbar.bulletedList')}>
        <IconButton
          onClick={() => execCommand('insertUnorderedList')}
          disabled={readOnly}
        >
          <FormatListBulleted color={readOnly ? 'disabled' : 'action'} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.numberedList')}>
        <IconButton
          onClick={() => execCommand('insertOrderedList')}
          disabled={readOnly}
        >
          <FormatListNumbered color={readOnly ? 'disabled' : 'action'} />
        </IconButton>
      </Tooltip>
      <Divider orientation="vertical" sx={{ my: 1 }} />
      <Tooltip title={t('asciiDocEditor.toolbar.bold')}>
        <IconButton onClick={() => execCommand('bold')} disabled={readOnly}>
          <FormatBold color={readOnly ? 'disabled' : 'action'} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.italic')}>
        <IconButton onClick={() => execCommand('italic')} disabled={readOnly}>
          <FormatItalic color={readOnly ? 'disabled' : 'action'} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('asciiDocEditor.toolbar.highlight')}>
        <IconButton
          onClick={() => execCommand('hiliteColor', '#ff0')}
          disabled={readOnly}
        >
          <Highlight color={readOnly ? 'disabled' : 'action'} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

/**
 * Macro block component that displays macro as uneditable with source view toggle
 */
function MacroBlock({
  macroSource,
  children,
}: {
  macroSource: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [showSource, setShowSource] = useState(false);

  return (
    <Box
      className="visual-editor-macro-block"
      contentEditable={false}
      data-macro-source={encodeURIComponent(macroSource)}
      sx={{
        position: 'relative',
        border: '2px dashed',
        borderColor: 'primary.300',
        borderRadius: 1,
        my: 2,
        p: 1,
        backgroundColor: 'background.level1',
        '&:hover': {
          borderColor: 'primary.500',
        },
        '&::before': {
          content: `"${t('visualEditor.macroBlock')}"`,
          position: 'absolute',
          top: -12,
          left: 8,
          backgroundColor: 'primary.100',
          color: 'primary.700',
          fontSize: '0.7rem',
          fontWeight: 600,
          px: 1,
          borderRadius: 0.5,
        },
      }}
      onClick={() => setShowSource(!showSource)}
    >
      {showSource ? (
        <Box
          component="pre"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            m: 0,
            p: 1,
            backgroundColor: 'background.level2',
            borderRadius: 0.5,
          }}
        >
          {macroSource}
        </Box>
      ) : (
        children
      )}
    </Box>
  );
}

export function VisualEditor({
  htmlContent,
  rawContent,
  cardKey,
  contentRef,
  onContentChange,
  readOnly = false,
}: VisualEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Extract macros from the raw AsciiDoc content and memoize
  const extractedMacros = useMemo(
    () => extractMacros(rawContent),
    [rawContent]
  );

  // Store macros ref for use in callbacks
  const macrosRef = useRef<ExtractedMacro[]>(extractedMacros);
  macrosRef.current = extractedMacros;

  // Combine macro metadata with UI components
  const combinedMacros = useMemo(
    () =>
      Object.entries(macroMetadata).reduce<
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (MacroMetadata & { component: (props: any) => ReactElement })[]
      >((acc, [key, value]) => {
        acc.push({
          ...value,
          component: UImacros[key as UIMacroName] ?? (() => <>err</>),
        });
        return acc;
      }, []),
    []
  );

  // Create a counter to track which macro we're rendering
  const macroCounterRef = useRef(0);

  // Parse HTML and replace macros with visual components
  const parsedContent = useMemo(() => {
    // Reset the macro counter for each parse
    macroCounterRef.current = 0;

    // Track which macros we've matched by their name
    const macroMatchCounts: Record<string, number> = {};

    return parseReact(htmlContent, {
      replace: (node) => {
        if (node.type === 'tag') {
          // Handle macro-content divs (from wrapped macro output)
          // These are macros like report, graph, scoreCard, etc. that produce rendered content
          if (
            node.name === 'div' &&
            node.attribs?.class?.includes('macro-content')
          ) {
            const macroName = node.attribs['data-macro-name'];

            if (macroName) {
              // Find the corresponding extracted macro by name and order
              // (same logic as UI macros below)
              if (!(macroName in macroMatchCounts)) {
                macroMatchCounts[macroName] = 0;
              }
              const matchIndex = macroMatchCounts[macroName]++;

              // Find the macro in extractedMacros
              const matchingMacros = extractedMacros.filter(
                (m) => m.name === macroName
              );
              const extractedMacro = matchingMacros[matchIndex];

              // Use the original source from extractedMacros to preserve exact formatting
              const macroSource = extractedMacro?.source ??
                `{{#${macroName}}}...{{/${macroName}}}`;

              // Render the macro content as-is but wrapped in MacroBlock
              return (
                <MacroBlock macroSource={macroSource}>
                  {/* Render the div's children as the macro preview */}
                  <div
                    dangerouslySetInnerHTML={{
                      __html: node.children
                        ?.map((child) => {
                          if ('data' in child) return child.data;
                          if ('name' in child) {
                            // Re-serialize the child element
                            const attrs = Object.entries(child.attribs || {})
                              .map(([k, v]) => `${k}="${v}"`)
                              .join(' ');
                            const innerHtml = child.children
                              ?.map((c) => ('data' in c ? c.data : ''))
                              .join('');
                            return `<${child.name}${attrs ? ' ' + attrs : ''}>${innerHtml || ''}</${child.name}>`;
                          }
                          return '';
                        })
                        .join('') || '',
                    }}
                  />
                </MacroBlock>
              );
            }
          }

          // Handle UI macros (createCards, vega) that produce placeholder tags
          const macro = combinedMacros.find((m) => m.tagName === node.name);
          if (macro) {
            const attributes = parseDataAttributes(node.attribs);

            // Find the corresponding extracted macro by name and order
            const macroName = macro.name;
            if (!(macroName in macroMatchCounts)) {
              macroMatchCounts[macroName] = 0;
            }
            const matchIndex = macroMatchCounts[macroName]++;

            // Find the macro in extractedMacros
            const matchingMacros = extractedMacros.filter(
              (m) => m.name === macroName
            );
            const extractedMacro = matchingMacros[matchIndex];

            // Use the original source if found, otherwise construct from attributes
            const macroSource = extractedMacro?.source ??
              `{{#${macroName}}}\n  ${JSON.stringify(attributes, null, 2)}\n{{/${macroName}}}`;

            return (
              <MacroBlock macroSource={macroSource}>
                {React.createElement(macro.component, {
                  ...attributes,
                  macroKey: cardKey,
                  preview: true,
                })}
              </MacroBlock>
            );
          }
        }
      },
    });
  }, [htmlContent, combinedMacros, cardKey, extractedMacros]);

  // Handle content changes
  const handleInput = useCallback(() => {
    if (readOnly || !editorRef.current) return;

    const editedHtml = editorRef.current.innerHTML;

    // Extract macro sources from the edited HTML (they're stored in data attributes)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = editedHtml;
    const macroBlocks = tempDiv.querySelectorAll('.visual-editor-macro-block');

    // Build a list of macros to restore
    const macrosToRestore: ExtractedMacro[] = [];
    let macroIndex = 0;
    macroBlocks.forEach((block) => {
      const encodedSource = block.getAttribute('data-macro-source');
      if (encodedSource) {
        const source = decodeURIComponent(encodedSource);
        const id = `restored-macro-${macroIndex++}`;
        macrosToRestore.push({
          id,
          name: 'unknown',
          source,
          placeholder: `[[MACRO:${id}]]`,
        });
        // Replace the block with a placeholder in the HTML
        const placeholder = document.createElement('span');
        placeholder.textContent = `[[MACRO:${id}]]`;
        placeholder.className = 'macro-placeholder';
        block.replaceWith(placeholder);
      }
    });

    // Convert the HTML (with placeholders) to AsciiDoc
    const htmlWithPlaceholders = tempDiv.innerHTML;
    let asciidocContent = htmlToAsciidoc(htmlWithPlaceholders);

    // Restore the original macro sources
    asciidocContent = restoreMacrosFromPlaceholders(
      asciidocContent,
      macrosToRestore
    );

    contentRef.current = asciidocContent;
    onContentChange();
  }, [readOnly, contentRef, onContentChange]);

  // Handle paste to sanitize content
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (readOnly) {
        e.preventDefault();
        return;
      }

      // Get plain text and let the browser handle basic formatting
      const text = e.clipboardData.getData('text/plain');
      if (text) {
        e.preventDefault();
        document.execCommand('insertText', false, text);
      }
    },
    [readOnly]
  );

  return (
    <Stack height="100%">
      <VisualEditorToolbar readOnly={readOnly} />
      <Box
        ref={editorRef}
        className="doc visual-editor"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          p: 2,
          outline: 'none',
          minHeight: 200,
          '&:focus': {
            outline: 'none',
          },
          // Prevent editing of macro blocks
          '& .visual-editor-macro-block': {
            userSelect: 'none',
            cursor: 'pointer',
          },
        }}
      >
        {parsedContent}
      </Box>
    </Stack>
  );
}

export default VisualEditor;
