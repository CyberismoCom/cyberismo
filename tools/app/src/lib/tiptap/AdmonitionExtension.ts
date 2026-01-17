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

import { Node, mergeAttributes } from '@tiptap/core';

/**
 * TipTap extension for AsciiDoc admonitions (NOTE, TIP, WARNING, etc.)
 */
export const Admonition = Node.create({
  name: 'admonition',

  group: 'block',

  content: 'paragraph+',

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-admonition-type') || 'note',
        renderHTML: (attributes) => ({
          'data-admonition-type': attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="admonition"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const type = HTMLAttributes['data-admonition-type'] || 'note';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'admonition',
        class: `admonition admonition-${type}`,
      }),
      0,
    ];
  },
});

export default Admonition;
