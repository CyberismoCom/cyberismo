// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
