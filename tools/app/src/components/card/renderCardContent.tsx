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
import React from 'react';

import CheckBox from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank';

import createDOMPurify from 'dompurify';
import parseReact, { domToReact } from 'html-react-parser';
import type { DOMNode } from 'html-react-parser';

import { macroMetadata } from '@cyberismo/data-handler/macros/common';

import type { UIMacroName } from '@/components/macros';
import { macros as UImacros } from '@/components/macros';
import Mermaid from '@/components/macros/Mermaid';
import { SafeRouterLink } from '@/components/SafeRouterLink';
import SvgWrapper from '@/components/SvgWrapper';
import { isAppUrl, parseDataAttributes } from '@/lib/utils';

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
    'data-mermaid-code',
  ],
};

// We simply trust that the macro has been validated
// If a validation error occurs, it should also not try to render
const combinedMacros = Object.entries(macroMetadata).map(([key, value]) => ({
  ...value,
  component: UImacros[key as UIMacroName] ?? (() => <>err</>),
}));

function decodeBase64Utf8(encoded: string): string | null {
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

export interface RenderCardHtmlOptions {
  /** The card key inside of which the content is rendered. */
  macroKey: string;
  /** True if the content is rendered in preview mode. */
  preview?: boolean;
  /** Fallback filename for SVG downloads (usually the card title). */
  downloadName?: string;
}

/**
 * Sanitizes card content HTML and parses it into React elements.
 * Replaces macro tags with their React components and wraps SVG diagrams
 * (graph macros, mermaid blocks) in React-owned SvgWrapper controls.
 */
export function renderCardHtml(html: string, options: RenderCardHtmlOptions) {
  const { macroKey, preview, downloadName } = options;

  // NOTE: Parser is case-insensitive and lower cases all tags and attributes
  // htmlparser2 options cannot be used on the browser
  const replaceNode = (node: DOMNode): ReactElement | undefined => {
    if (node.type !== 'tag') {
      return;
    }
    if (node.name === 'a') {
      const href = node.attribs?.href;
      if (href && isAppUrl(href)) {
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
    if (node.name === 'div') {
      // SVG diagrams emitted by the backend (e.g. the graph macro)
      if (node.attribs?.['data-type'] === 'cyberismo-svg-wrapper') {
        return (
          <SvgWrapper downloadName={downloadName}>
            {domToReact(node.children as DOMNode[], { replace: replaceNode })}
          </SvgWrapper>
        );
      }
      // [mermaid] AsciiDoc block placeholders
      if (node.attribs?.['data-mermaid-code'] !== undefined) {
        const code = decodeBase64Utf8(node.attribs['data-mermaid-code']);
        if (code === null) {
          return;
        }
        return <Mermaid code={code} macroKey={macroKey} preview={!!preview} />;
      }
    }
    const macro = combinedMacros.find((m) => m.tagName === node.name);
    if (macro) {
      const attributes = parseDataAttributes(node.attribs);
      return React.createElement(macro.component, {
        ...attributes,
        macroKey,
        preview,
      });
    }
  };

  return parseReact(contentPurify.sanitize(html, sanitizeOptions), {
    replace: replaceNode,
  });
}
