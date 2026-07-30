/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Box } from '@mui/joy';
import DOMPurify from 'dompurify';
import parseReact from 'html-react-parser';
import { marked } from 'marked';
import { useMemo } from 'react';

/**
 * Renders a Markdown string as formatted content.
 *
 * Cards are Asciidoc, but skills are Markdown, so this is a separate and much
 * simpler pipeline than renderCardContent: there are no macros to substitute.
 * The output is styled by the shared '.doc' rules in globals.css.
 */
export function MarkdownContent({ markdown }: { markdown: string }) {
  const content = useMemo(() => {
    const html = marked.parse(markdown, { async: false });
    return parseReact(DOMPurify.sanitize(html));
  }, [markdown]);

  return (
    <Box className="doc markdown" data-cy="markdownContent">
      {content}
    </Box>
  );
}

export default MarkdownContent;
