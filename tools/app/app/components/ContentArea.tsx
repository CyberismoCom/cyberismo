/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useState } from 'react';
import { CardAttachment, CardDetails, Project } from '../lib/definitions';
import Processor from '@asciidoctor/core';
import { parse } from 'node-html-parser';
import { Box, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import MetadataView from './MetadataView';

type ContentAreaProps = {
  card: CardDetails | null;
  error: string | null;
  onMetadataClick?: () => void;
};

export const ContentArea: React.FC<ContentAreaProps> = ({
  card,
  error,
  onMetadataClick,
}) => {
  const [visibleHeaderId, setVisibleHeaderId] = useState<string | null>(null);

  const { t } = useTranslation();

  if (error)
    return (
      <Box>
        {t('cardNotFound')} ({error})
      </Box>
    );
  if (!card) return <Box>{t('loading')}</Box>;

  const asciidocContent = card.content ?? '';
  let htmlContent = Processor()
    .convert(asciidocContent, {
      safe: 'safe',
    })
    .toString();

  if (card.attachments) {
    htmlContent = updateAttachmentLinks(htmlContent, card.attachments);
  }

  // On scroll, check which document headers are visible and update the table of contents scrolling state
  const handleScroll = () => {
    const headers = document.querySelectorAll('.doc h1, .doc h2, .doc h3');
    const visibleHeaderIds: string[] = [];
    headers.forEach((header) => {
      const rect = header.getBoundingClientRect();
      if (
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight &&
        header.id &&
        header.id !== ''
      ) {
        visibleHeaderIds.push(header.id);
      }
    });
    // Retain the scroll state if no headers are visible (we are in middle of a longer section)
    if (visibleHeaderIds.length > 0) {
      setVisibleHeaderId(visibleHeaderIds[0]);
    }
  };

  return (
    <Stack direction="row" height="100%">
      <Box
        width="100%"
        padding={3}
        flexGrow={1}
        minWidth={0}
        sx={{
          overflowY: 'scroll',
          scrollbarWidth: 'thin',
        }}
        onScroll={handleScroll}
      >
        <Stack spacing={3}>
          <Typography level="h1">
            {card.metadata?.summary ?? card.key}
          </Typography>
          <MetadataView
            editMode={false}
            initialExpanded={false}
            metadata={card?.metadata}
            onClick={onMetadataClick}
          />
          <Box padding={4}>
            <div
              className="doc"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </Box>
        </Stack>
      </Box>
      {renderTableOfContents(htmlContent, visibleHeaderId)}
    </Stack>
  );
};

type Header = {
  id: string;
  text: string;
  level: number;
};

function renderTableOfContents(
  htmlContent: string,
  visibleHeaderId: string | null = null,
) {
  // Parse the HTML content
  const root = parse(htmlContent);
  // Find all header tags
  const headers = root.querySelectorAll('h1, h2, h3').map((header) => ({
    id:
      header.getAttribute('id') ||
      header.text.trim().replace(/\s+/g, '-').toLowerCase(), // Create an id if it doesn't exist
    text: header.text,
    level: parseInt(header.tagName[1]),
  }));

  // Hack for first render: mark first header as visible, after this updates via handleScroll
  const highlightedHeader = visibleHeaderId ?? headers[0]?.id;

  return (
    <aside className="contentSidebar toc sidebar">
      <div className="toc-menu">
        {headers.length > 0 && <h3>TABLE OF CONTENTS</h3>}
        <ul>
          {headers.map((header, index) => (
            <li
              key={index}
              style={{ marginLeft: `${(header.level - 1) * 10}px` }}
            >
              <a
                id={`toc_${header.id}`}
                className={
                  highlightedHeader === header.id ? 'is-active' : undefined
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
}

function updateAttachmentLinks(
  htmlContent: string,
  attachments: CardAttachment[],
): string {
  attachments.forEach((attachment) => {
    htmlContent = htmlContent
      .replaceAll(`a/${attachment.fileName}`, attachment.fileName) // Remove imagesdir from links
      .replaceAll(
        attachment.fileName,
        `/api/cards/${attachment.card}/a/${attachment.fileName}`,
      ); // Add API path to attachment links
  });
  return htmlContent;
}
