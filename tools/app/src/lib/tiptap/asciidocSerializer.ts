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

import type { JSONContent } from '@tiptap/react';

/**
 * Serialize TipTap marks to AsciiDoc inline formatting
 */
function serializeMarks(text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>): string {
  if (!marks || marks.length === 0) return text;

  let result = text;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `*${result}*`;
        break;
      case 'italic':
        result = `_${result}_`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'highlight':
        result = `#${result}#`;
        break;
      case 'link': {
        const href = mark.attrs?.href as string || '';
        if (href.startsWith('xref:')) {
          // xref link - extract the file part
          result = `${href}[${result}]`;
        } else {
          // External or other link
          result = `${href}[${result}]`;
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Serialize inline content (text nodes with marks)
 */
function serializeInlineContent(content?: JSONContent[]): string {
  if (!content) return '';

  return content
    .map((node) => {
      if (node.type === 'text') {
        return serializeMarks(node.text || '', node.marks);
      }
      if (node.type === 'hardBreak') {
        return ' +\n';
      }
      return '';
    })
    .join('');
}

/**
 * Serialize a single TipTap node to AsciiDoc
 */
function serializeNode(node: JSONContent, depth: number = 0): string {
  switch (node.type) {
    case 'doc':
      return (node.content || []).map((n) => serializeNode(n, depth)).join('\n\n');

    case 'paragraph': {
      const text = serializeInlineContent(node.content);
      return text;
    }

    case 'heading': {
      const level = (node.attrs?.level as number) || 1;
      const prefix = '='.repeat(level);
      const text = serializeInlineContent(node.content);
      return `${prefix} ${text}`;
    }

    case 'bulletList': {
      return (node.content || [])
        .map((item) => serializeListItem(item, '*', depth + 1))
        .join('\n');
    }

    case 'orderedList': {
      return (node.content || [])
        .map((item) => serializeListItem(item, '.', depth + 1))
        .join('\n');
    }

    case 'listItem': {
      // This is handled by serializeListItem
      const para = node.content?.find((n) => n.type === 'paragraph');
      return serializeInlineContent(para?.content);
    }

    case 'codeBlock': {
      const language = (node.attrs?.language as string) || 'text';
      const code = node.content?.map((n) => n.text || '').join('') || '';
      return `[source,${language}]\n----\n${code}\n----`;
    }

    case 'blockquote': {
      const innerContent = (node.content || [])
        .map((n) => serializeNode(n, depth))
        .join('\n');
      return `____\n${innerContent}\n____`;
    }

    case 'horizontalRule':
      return "'''";

    case 'image': {
      const src = (node.attrs?.src as string) || '';
      const alt = (node.attrs?.alt as string) || '';
      return `image::${src}[${alt}]`;
    }

    case 'admonition': {
      const admonitionType = ((node.attrs?.type as string) || 'note').toUpperCase();
      const innerContent = (node.content || [])
        .map((n) => serializeInlineContent(n.content))
        .join(' ');
      return `${admonitionType}: ${innerContent}`;
    }

    case 'macroBlock': {
      // Cyberismo macros and passthrough blocks are stored with their exact source
      // This is the KEY safeguard - we never modify the macro content
      return (node.attrs?.source as string) || '';
    }

    case 'hardBreak':
      return ' +\n';

    default:
      // Unknown node type - try to serialize content
      if (node.content) {
        return (node.content || []).map((n) => serializeNode(n, depth)).join('');
      }
      return '';
  }
}

/**
 * Serialize a list item with proper bullet/number prefix
 */
function serializeListItem(item: JSONContent, marker: string, depth: number): string {
  const prefix = marker.repeat(depth);
  const para = item.content?.find((n) => n.type === 'paragraph');
  const text = serializeInlineContent(para?.content);

  // Handle nested lists
  const nestedList = item.content?.find((n) => n.type === 'bulletList' || n.type === 'orderedList');
  if (nestedList) {
    const nestedMarker = nestedList.type === 'bulletList' ? '*' : '.';
    const nestedContent = (nestedList.content || [])
      .map((nestedItem) => serializeListItem(nestedItem, nestedMarker, depth + 1))
      .join('\n');
    return `${prefix} ${text}\n${nestedContent}`;
  }

  return `${prefix} ${text}`;
}

/**
 * Serialize TipTap document to AsciiDoc string
 */
export function serializeAsciidoc(doc: JSONContent): string {
  if (!doc || doc.type !== 'doc') {
    return '';
  }

  const result = serializeNode(doc);

  // Clean up multiple consecutive blank lines
  return result.replace(/\n{3,}/g, '\n\n').trim();
}
