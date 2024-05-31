'use client'
import React, { useState } from 'react'
import { CardAttachment, CardDetails, Project } from '../lib/definitions'
import Processor from '@asciidoctor/core'
import { parse } from 'node-html-parser'

type ContentAreaProps = {
  card: CardDetails | null
  error: string | null
  preview: boolean
}

export const ContentArea: React.FC<ContentAreaProps> = ({
  card,
  error,
  preview,
}) => {
  const [visibleHeaderId, setVisibleHeaderId] = useState<string | null>(null)

  if (error) return <div>Could not find card. ({error})</div>
  if (!card) return <div>Loading...</div>

  const asciidocContent = card.content ?? ''
  let htmlContent = Processor()
    .convert(asciidocContent, {
      safe: 'safe',
    })
    .toString()

  if (card.attachments) {
    htmlContent = updateAttachmentLinks(htmlContent, card.attachments)
  }

  // On scroll, check which document headers are visible and update the table of contents scrolling state
  const handleScroll = () => {
    const headers = document.querySelectorAll('.doc h1, .doc h2, .doc h3')
    const visibleHeaderIds: string[] = []
    headers.forEach((header) => {
      const rect = header.getBoundingClientRect()
      if (
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight &&
        header.id &&
        header.id !== ''
      ) {
        visibleHeaderIds.push(header.id)
      }
    })
    // Retain the scroll state if no headers are visible (we are in middle of a longer section)
    if (visibleHeaderIds.length > 0) {
      setVisibleHeaderId(visibleHeaderIds[0])
    }
  }

  return (
      <div className="contentArea">
        <div className="adocContent" onScroll={handleScroll}>
          <h1>{card.metadata?.summary ?? card.key}</h1>
          <div
            className="doc"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
        {renderTableOfContents(htmlContent, visibleHeaderId)}
      </div>
  )
}

type Header = {
  id: string
  text: string
  level: number
}

function renderTableOfContents(
  htmlContent: string,
  visibleHeaderId: string | null = null
) {
  // Parse the HTML content
  const root = parse(htmlContent)
  // Find all header tags
  const headerTags = ['h1', 'h2', 'h3']
  const foundHeaders: Header[] = []

  headerTags.forEach((tag) => {
    const headers = root.querySelectorAll(tag)
    headers.forEach((header) => {
      const level = parseInt(tag.substring(1), 10) // Get the numeric part of the tag name to represent the level
      foundHeaders.push({
        id:
          header.getAttribute('id') ||
          header.text.trim().replace(/\s+/g, '-').toLowerCase(), // Create an id if it doesn't exist
        text: header.text,
        level,
      })
    })
  })

  const headers = foundHeaders.sort((a, b) => a.level - b.level)

  // Hack for first render: mark first header as visible, after this updates via handleScroll
  const highlightedHeader = visibleHeaderId ?? headers[0]?.id

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
  )
}

function updateAttachmentLinks(
  htmlContent: string,
  attachments: CardAttachment[]
): string {
  attachments.forEach((attachment) => {
    htmlContent = htmlContent
      .replaceAll(`a/${attachment.fileName}`, attachment.fileName) // Remove imagesdir from links
      .replaceAll(
        attachment.fileName,
        `/api/cards/${attachment.card}/a/${attachment.fileName}`
      ) // Add API path to attachment links
  })
  return htmlContent
}
