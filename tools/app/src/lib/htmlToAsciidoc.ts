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

/**
 * Converts HTML content back to AsciiDoc format.
 * Preserves macro blocks that were marked as uneditable.
 */
export function htmlToAsciidoc(html: string): string {
  // Create a temporary DOM element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Process the content
  const result = processNode(tempDiv);

  // Clean up multiple consecutive blank lines
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Recursively processes DOM nodes and converts to AsciiDoc
 */
function processNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  // Handle macro blocks - preserve the original macro source
  if (element.classList.contains('visual-editor-macro-block')) {
    // Extract macro content from data attribute or inner macro tags
    const macroSource = element.getAttribute('data-macro-source');
    if (macroSource) {
      // Decode URL encoding used to store the source
      try {
        const decoded = decodeURIComponent(macroSource);
        return `\n${decoded}\n`;
      } catch {
        // Fallback: try HTML entity decoding
        const decoded = macroSource
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        return `\n${decoded}\n`;
      }
    }
    // Fallback: look for actual macro tags inside
    const macroTags = [
      'create-cards',
      'score-card',
      'vega',
      'vega-lite',
      'report',
      'graph',
      'include',
      'xref',
      'percentage',
      'image',
    ];
    for (const tag of macroTags) {
      const macroEl = element.querySelector(tag);
      if (macroEl) {
        return `\n${macroEl.outerHTML}\n`;
      }
    }
    return '';
  }

  // Handle macro placeholders (used during conversion)
  if (element.classList.contains('macro-placeholder')) {
    return element.textContent || '';
  }

  // Check for macro tags directly
  const macroTags = [
    'create-cards',
    'score-card',
    'vega',
    'vega-lite',
    'report',
    'graph',
    'include',
    'xref',
    'percentage',
    'image',
  ];
  if (macroTags.includes(tagName)) {
    return `\n${element.outerHTML}\n`;
  }

  const children = Array.from(node.childNodes);
  const childContent = children.map((child) => processNode(child)).join('');

  switch (tagName) {
    // Headings
    case 'h1':
      return `\n== ${childContent.trim()}\n`;
    case 'h2':
      return `\n=== ${childContent.trim()}\n`;
    case 'h3':
      return `\n==== ${childContent.trim()}\n`;
    case 'h4':
      return `\n===== ${childContent.trim()}\n`;
    case 'h5':
      return `\n====== ${childContent.trim()}\n`;
    case 'h6':
      return `\n======= ${childContent.trim()}\n`;

    // Text formatting
    case 'strong':
    case 'b':
      return `*${childContent}*`;
    case 'em':
    case 'i':
      return `_${childContent}_`;
    case 'mark':
      return `#${childContent}#`;
    case 'code':
      return `\`${childContent}\``;
    case 'del':
    case 's':
      return `[.line-through]#${childContent}#`;
    case 'u':
      return `[.underline]#${childContent}#`;
    case 'sup':
      return `^${childContent}^`;
    case 'sub':
      return `~${childContent}~`;

    // Links
    case 'a': {
      const href = element.getAttribute('href') || '';
      if (href.startsWith('#')) {
        // Internal anchor link
        return `<<${href.slice(1)},${childContent}>>`;
      }
      // Check if this is an xref link (AsciiDoctor converts xref:file.adoc to href="file.html")
      if (href.endsWith('.html') && !href.includes('://') && !href.startsWith('/')) {
        // Convert back to xref format: file.html -> xref:file.adoc[text]
        const adocFile = href.replace(/\.html$/, '.adoc');
        return `xref:${adocFile}[${childContent}]`;
      }
      // External or other links
      if (href.includes('://')) {
        return `${href}[${childContent}]`;
      }
      // Other relative links
      return `link:${href}[${childContent}]`;
    }

    // Lists
    case 'ul':
      return `\n${processListItems(element, '*')}\n`;
    case 'ol':
      return `\n${processListItems(element, '.')}\n`;
    case 'li':
      // Handled by processListItems
      return childContent;

    // Paragraphs and blocks
    case 'p': {
      const trimmed = childContent.trim();
      if (!trimmed) return '';
      return `\n${trimmed}\n`;
    }
    case 'div': {
      // Check for visual-editor-macro-block (from VisualEditor with preserved source)
      if (element.classList.contains('visual-editor-macro-block')) {
        const macroSource = element.getAttribute('data-macro-source');
        if (macroSource) {
          // Decode URL encoding used to store the source
          try {
            const decoded = decodeURIComponent(macroSource);
            return `\n${decoded}\n`;
          } catch {
            // Fallback: try HTML entity decoding
            const decoded = macroSource
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"');
            return `\n${decoded}\n`;
          }
        }
      }
      // Check for macro-content div (from backend wrapped macro output)
      // Note: The actual macro source is preserved via the visual-editor-macro-block wrapper
      // that gets added by VisualEditor. If we see a bare macro-content div, we skip its content.
      if (element.classList.contains('macro-content')) {
        // This shouldn't happen in normal flow since VisualEditor wraps these in MacroBlock,
        // but if it does, we return empty to avoid duplicating the macro content
        return '';
      }
      // Check for special div types
      if (
        element.classList.contains('paragraph') ||
        element.classList.contains('sect1') ||
        element.classList.contains('sect2') ||
        element.classList.contains('sectionbody')
      ) {
        return childContent;
      }
      return childContent;
    }
    case 'section':
      return childContent;

    // Block quotes
    case 'blockquote':
      return `\n____\n${childContent.trim()}\n____\n`;

    // Code blocks
    case 'pre': {
      const codeEl = element.querySelector('code');
      const content = codeEl ? codeEl.textContent : element.textContent;
      const language =
        codeEl?.className?.match(/language-(\w+)/)?.[1] || 'text';
      return `\n[source,${language}]\n----\n${content?.trim() || ''}\n----\n`;
    }

    // Tables
    case 'table':
      return processTable(element);
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'tr':
    case 'td':
    case 'th':
      // Handled by processTable
      return childContent;

    // Horizontal rule
    case 'hr':
      return "\n'''\n";

    // Line break
    case 'br':
      return ' +\n';

    // Images
    case 'img': {
      const src = element.getAttribute('src') || '';
      const alt = element.getAttribute('alt') || '';
      return `image::${src}[${alt}]`;
    }

    // Admonitions
    case 'aside':
    case 'note':
      return `\n[NOTE]\n====\n${childContent.trim()}\n====\n`;

    // Spans with roles
    case 'span': {
      const className = element.className;
      if (className.includes('big')) {
        return `[.big]#${childContent}#`;
      }
      if (className.includes('small')) {
        return `[.small]#${childContent}#`;
      }
      // Check for background color (highlight)
      const style = element.getAttribute('style') || '';
      if (
        style.includes('background-color') ||
        style.includes('background:')
      ) {
        return `#${childContent}#`;
      }
      return childContent;
    }

    // Default: just return children content
    default:
      return childContent;
  }
}

/**
 * Process list items with proper markers
 */
function processListItems(
  listElement: HTMLElement,
  marker: string,
  depth: number = 1,
): string {
  const items = Array.from(listElement.children).filter(
    (el) => el.tagName.toLowerCase() === 'li',
  );
  const prefix = marker.repeat(depth);

  return items
    .map((item) => {
      const children = Array.from(item.childNodes);
      let content = '';
      let nestedList = '';

      children.forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          const tag = el.tagName.toLowerCase();
          if (tag === 'ul') {
            nestedList += processListItems(el, '*', depth + 1);
          } else if (tag === 'ol') {
            nestedList += processListItems(el, '.', depth + 1);
          } else {
            content += processNode(child);
          }
        } else {
          content += processNode(child);
        }
      });

      const result = `${prefix} ${content.trim()}`;
      return nestedList ? `${result}\n${nestedList}` : result;
    })
    .join('\n');
}

/**
 * Process HTML table to AsciiDoc table
 */
function processTable(tableElement: HTMLElement): string {
  const rows: string[][] = [];
  let hasHeader = false;

  // Process thead
  const thead = tableElement.querySelector('thead');
  if (thead) {
    hasHeader = true;
    const headerRow = thead.querySelector('tr');
    if (headerRow) {
      const cells = Array.from(headerRow.querySelectorAll('th, td'));
      rows.push(cells.map((cell) => processNode(cell).trim()));
    }
  }

  // Process tbody
  const tbody = tableElement.querySelector('tbody');
  const bodyRows = tbody
    ? tbody.querySelectorAll('tr')
    : tableElement.querySelectorAll('tr');

  bodyRows.forEach((tr) => {
    if (!thead || !thead.contains(tr)) {
      const cells = Array.from(tr.querySelectorAll('td, th'));
      rows.push(cells.map((cell) => processNode(cell).trim()));
    }
  });

  if (rows.length === 0) return '';

  // Build AsciiDoc table
  const colCount = Math.max(...rows.map((r) => r.length));
  let result = '\n[cols="' + Array(colCount).fill('1').join(',') + '"]\n';
  result += '|===\n';

  rows.forEach((row, index) => {
    result += '| ' + row.join(' | ') + '\n';
    // Add blank line after header row
    if (hasHeader && index === 0) {
      result += '\n';
    }
  });

  result += '|===\n';
  return result;
}
