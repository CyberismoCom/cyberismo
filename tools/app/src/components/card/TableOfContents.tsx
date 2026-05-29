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

import { parse } from 'node-html-parser';
import { Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';

type TableOfContentsProps = {
  htmlContent: string;
  visibleHeaderIds?: string[] | null;
  inline?: boolean;
};

export const TableOfContents = ({
  htmlContent,
  visibleHeaderIds = null,
  inline = false,
}: TableOfContentsProps) => {
  const { t } = useTranslation();

  const root = parse(htmlContent);
  const headers = root.querySelectorAll('h1, h2, h3').map((header) => ({
    id:
      header.getAttribute('id') ||
      header.text.trim().replace(/\s+/g, '-').toLowerCase(),
    text: header.text,
    level: parseInt(header.tagName[1]),
  }));

  if (headers.length === 0) {
    return null;
  }

  // Hack for first render: mark first header as visible, after this updates via handleScroll
  const highlightedHeaders = visibleHeaderIds ?? [headers[0]?.id ?? ''];

  return (
    <aside
      className={inline ? 'contentSidebar toc' : 'contentSidebar toc sidebar'}
    >
      <div className="toc-menu" style={{ marginLeft: 2 }}>
        {!inline && (
          <Typography
            level="title-sm"
            fontWeight="bold"
            sx={{ marginBottom: 1 }}
          >
            {t('tableOfContents')}
          </Typography>
        )}
        <ul>
          {headers.map((header, index) => (
            <li key={index} data-level={header.level - 1}>
              <a
                id={`toc_${header.id}`}
                className={
                  highlightedHeaders.includes(header.id)
                    ? 'is-active'
                    : undefined
                }
                href={`#${header.id}`}
              >
                {header.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};
