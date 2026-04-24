/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

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
import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { ExpandedLinkType, MetadataValue } from '../lib/definitions';

import { parse } from 'node-html-parser';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Stack,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import MetadataView from './MetadataSection/MetadataSection';
import { ChecksAccordion, type CheckCollection } from './ChecksAccordion';
import { parseDataAttributes } from '../lib/utils';
import { useLocation } from 'react-router';
import ExpandMore from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CheckBox from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank';

import { useAppDispatch, useAppSelector } from '../lib/hooks';
import { viewChanged } from '../lib/slices/pageState';

import createDOMPurify from 'dompurify';
import type { MacroMetadata } from '@cyberismo/data-handler/interfaces/macros';
import { macroMetadata } from '@cyberismo/data-handler/macros/common';
import type { UIMacroName } from './macros';
import { macros as UImacros } from './macros';
import parseReact, { domToReact } from 'html-react-parser';
import type { DOMNode } from 'html-react-parser';
import type {
  PolicyCheckCollection,
  Notification,
  QueryResult,
  CalculationLink,
} from '@cyberismo/data-handler/types/queries';
import type { CardResponse, Connector } from '../lib/api/types';
import SvgViewerModal from './modals/svgViewerModal';
import { SafeRouterLink } from './SafeRouterLink';
import LinkedCardsSection, {
  type LinkFormState,
  type LinkFormSubmitData,
} from './LinkedCardsSection/LinkedCardsSection';

type ContentAreaProps = {
  cards: QueryResult<'tree'>[];
  card: CardResponse;
  linkTypes: ExpandedLinkType[];
  connectors?: Connector[];
  onMetadataUpdate?: (update: {
    metadata: Record<string, MetadataValue>;
  }) => Promise<void>;
  onLinkFormSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
  onDeleteLink?: (data: CalculationLink) => void | Promise<void>;
  preview?: boolean;
  linkFormState: LinkFormState;
  onLinkFormChange?: (state: LinkFormState) => void;
};

interface HTMLElementWithCleanup extends HTMLElement {
  __cleanupSvgControls?: () => void;
}

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

const Notifications = ({
  notifications,
}: {
  notifications: Notification[];
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (notifications.length === 0) {
    return null;
  }
  return (
    <Box sx={{ marginTop: 2, maxWidth: 400 }}>
      {notifications.length > 0 && (
        <Accordion expanded={expanded}>
          <AccordionSummary
            indicator={<ExpandMore />}
            onClick={() => setExpanded(!expanded)}
            sx={{
              borderRadius: '4px',
              marginTop: 1,
              marginBottom: 1,
            }}
          >
            <Typography
              level="body-xs"
              color="primary"
              variant="soft"
              width={24}
              height={24}
              alignContent="center"
              borderRadius={40}
              marginLeft={0}
              paddingX={1.1}
            >
              {notifications.length}
            </Typography>
            <Typography
              level="title-sm"
              fontWeight="bold"
              sx={{ width: '100%' }}
            >
              {t('notifications')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              {notifications.map((notification, index) => (
                <Alert
                  key={index}
                  color="primary"
                  variant="soft"
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box>
                    <Typography level="title-sm" fontWeight="bold">
                      {notification.category} - {notification.title}
                    </Typography>
                    <Typography fontSize="xs">
                      {notification.message}
                    </Typography>
                  </Box>
                </Alert>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
};

const PolicyChecks = ({
  policyChecks,
  onGoToField,
}: {
  policyChecks: PolicyCheckCollection;
  onGoToField?: (fieldName: string) => void;
}) => {
  const { t } = useTranslation();

  // Convert PolicyCheckCollection to CheckCollection format
  const checksData: CheckCollection = {
    successes: policyChecks.successes,
    failures: policyChecks.failures,
  };

  return (
    <ChecksAccordion
      checks={checksData}
      successTitle={t('passedPolicyChecks')}
      failureTitle={t('failedPolicyChecks')}
      successPassText={t('policyCheckPass')}
      failureFailText={t('policyCheckFail')}
      goToFieldText={t('goToField')}
      initialSuccessesExpanded={false}
      initialFailuresExpanded={true}
      onGoToField={onGoToField}
    />
  );
};

export const ContentArea: React.FC<ContentAreaProps> = ({
  card,
  cards,
  linkTypes,
  connectors,
  onMetadataUpdate,
  onLinkFormSubmit,
  preview,
  linkFormState,
  onLinkFormChange,
  onDeleteLink,
}) => {
  const [visibleHeaderIds, setVisibleHeaderIds] = useState<string[] | null>(
    null,
  );

  const [focusFieldKey, setFocusFieldKey] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);

  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null);

  const dispatch = useAppDispatch();

  const { t } = useTranslation();

  const lastTitle = useAppSelector((state) => state.page.title);
  const cardKey = useAppSelector((state) => state.page.cardKey);

  // scroll to last title on first render and when tab is changed
  useEffect(() => {
    if (lastTitle && contentRef && cardKey === card?.key) {
      const header = document.getElementById(lastTitle);
      if (header) {
        header.scrollIntoView();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef]);

  const [modalSvg, setModalSvg] = useState<string>('');
  const [isModalOpen, setModalOpen] = useState(false);

  const fullScreenIcon = renderToStaticMarkup(<OpenInFullIcon />);
  const downloadIcon = renderToStaticMarkup(<DownloadIcon />);

  const makeIconButton = (icon: string, aria: string) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', aria);
    Object.assign(btn.style, {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      padding: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as CSSStyleDeclaration);
    btn.innerHTML = icon;
    return btn;
  };

  const handleFullScreen = (htmlElementWithSVG: HTMLElement) => {
    const svgEl = htmlElementWithSVG.querySelector<SVGSVGElement>('svg');
    if (!svgEl) return;

    const xml = new XMLSerializer().serializeToString(svgEl);
    const svgWithNs = xml.match(/^<svg[^>]+xmlns=/)
      ? xml
      : xml.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');

    setModalSvg(svgWithNs);
    setModalOpen(true);
  };

  const handleDownload = (htmlElementWithSVG: HTMLElement) => {
    const svgEl = htmlElementWithSVG.querySelector<SVGSVGElement>('svg');
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if (!source.match(/^<svg[^>]+xmlns=/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns="http://www.w3.org/2000/svg"',
      );
    }

    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (svgEl.id || card.title) + ' diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!contentRef) return;

    const wrappers: NodeListOf<HTMLElement> =
      contentRef.querySelectorAll<HTMLElement>(
        '[data-type="cyberismo-svg-wrapper"]',
      );

    wrappers.forEach((wrapper) => {
      if (wrapper.querySelector('[data-cy="svg-controls"]')) return;

      if (wrapper.style.paddingTop === '') wrapper.style.paddingTop = '48px';
      if (wrapper.style.position === '') wrapper.style.position = 'relative';

      const controls = document.createElement('div');
      controls.setAttribute('data-cy', 'svg-controls');
      Object.assign(controls.style, {
        position: 'absolute',
        top: '8px',
        right: '8px',
        display: 'flex',
        gap: '6px',
        zIndex: 10,
      } as unknown as CSSStyleDeclaration);

      /* ---------- Buttons ---------- */
      const fullScreenBtn = makeIconButton(fullScreenIcon, 'fullscreen');
      const downloadBtn = makeIconButton(downloadIcon, 'download');

      const handleFullScreenClick = () => handleFullScreen(wrapper);
      const handleDownloadClick = () => handleDownload(wrapper);

      fullScreenBtn.addEventListener('click', handleFullScreenClick);
      downloadBtn.addEventListener('click', handleDownloadClick);

      controls.appendChild(fullScreenBtn);
      controls.appendChild(downloadBtn);
      wrapper.appendChild(controls);

      /* ---------- Cleanup for this wrapper ---------- */
      const cleanup = () => {
        fullScreenBtn.removeEventListener('click', handleFullScreenClick);
        downloadBtn.removeEventListener('click', handleDownloadClick);
        wrapper.querySelector('[data-cy="svg-controls"]')?.remove();
      };
      (wrapper as HTMLElementWithCleanup).__cleanupSvgControls = cleanup;
    });

    /* ---------- Global cleanup on effect teardown ---------- */
    return () => {
      wrappers.forEach((wrapper) => {
        (wrapper as HTMLElementWithCleanup).__cleanupSvgControls?.();
        delete (wrapper as HTMLElementWithCleanup).__cleanupSvgControls;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef, useLocation().key]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    setContentRef(node);
  }, []);

  const htmlContent = card.parsedContent || '';

  const sanitizedHtml = contentPurify.sanitize(htmlContent, {
    USE_PROFILES: { html: true, svg: true },
    ADD_TAGS: [...MACRO_TAGS, 'iframe'],
    ADD_ATTR: [
      'options',
      'key',
      'sandbox',
      'allow',
      'allowfullscreen',
      'frameborder',
    ],
  });

  const combinedMacros = Object.entries(macroMetadata).reduce<
    // We simply trust that the macro has been validated
    // If a validation error occurs, it should also not try to render
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MacroMetadata & { component: (props: any) => ReactElement })[]
  >((acc, [key, value]) => {
    acc.push({
      ...value,
      component: UImacros[key as UIMacroName] ?? (() => <>err</>),
    });
    return acc;
  }, []);

  // NOTE: Parser is case-insensitive and lower cases all tags and attributes
  // htmlparser2 options cannot be used on the browser
  const parsedContent = parseReact(sanitizedHtml, {
    replace: (node) => {
      if (node.type === 'tag') {
        if (node.name === 'a') {
          const href = node.attribs?.href;
          if (href?.startsWith('/cards/')) {
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
        const macro = combinedMacros.find((m) => m.tagName === node.name);
        if (macro) {
          const attributes = parseDataAttributes(node.attribs);
          return React.createElement(macro.component, {
            ...attributes,
            macroKey: card.key,
            preview,
          });
        }
      }
    },
  });

  // On scroll, check which document headers are visible and update state accordingly
  const handleScroll = () => {
    const headers = document.querySelectorAll('.doc h1, .doc h2, .doc h3');
    const onScreenHeaderIds: string[] = [];
    headers.forEach((header) => {
      const rect = header.getBoundingClientRect();
      if (
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight &&
        header.id &&
        header.id !== ''
      ) {
        onScreenHeaderIds.push(header.id);
      }
    });

    // If no headers are visible, we are in the middle of a long section and should not update anything
    if (onScreenHeaderIds.length > 0) {
      const firstVisibleHeaderId = onScreenHeaderIds[0];
      const lastVisibleHeaderId =
        onScreenHeaderIds[onScreenHeaderIds.length - 1];
      const lastHeaderVisible =
        lastVisibleHeaderId === headers[headers.length - 1].id;

      // Update table of contents highlight
      // When scrolling to end, highlight all headers on screen
      if (lastHeaderVisible) {
        setVisibleHeaderIds(onScreenHeaderIds);
      } else {
        setVisibleHeaderIds([firstVisibleHeaderId]);
      }

      if (lastTitle === firstVisibleHeaderId && cardKey === card.key) return;

      // Don't scroll upon edit if we are at top of document (first header visible)
      const shouldScroll = !onScreenHeaderIds.includes(headers[0].id);

      // Save current position for switching between edit/view modes
      dispatch(
        viewChanged({
          title: shouldScroll ? firstVisibleHeaderId : null,
          cardKey: card.key,
        }),
      );
    }
  };

  return (
    <Stack direction="row" height="100%">
      <SvgViewerModal
        open={isModalOpen}
        svgMarkup={modalSvg}
        onClose={() => setModalOpen(false)}
      />
      <Box
        width="100%"
        padding={3}
        flexGrow={1}
        sx={{
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}
        onScroll={handleScroll}
        ref={boxRef}
      >
        <Stack spacing={3} height="100%">
          <Typography level="h1">{card.title}</Typography>
          <MetadataView
            initialExpanded={false}
            card={card}
            onUpdate={onMetadataUpdate}
            focusFieldKey={focusFieldKey}
            onFieldFocused={() => setFocusFieldKey(null)}
          />
          <LinkedCardsSection
            card={card}
            cards={cards}
            linkTypes={linkTypes}
            connectors={connectors}
            preview={preview}
            linkFormState={linkFormState}
            onLinkFormChange={onLinkFormChange}
            onLinkFormSubmit={onLinkFormSubmit}
            onDeleteLink={onDeleteLink}
          />
          <Box>
            <div className="doc" ref={setRef}>
              {parsedContent}
            </div>
          </Box>
        </Stack>
      </Box>
      <Stack
        my={2}
        mr={3}
        sx={{
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          width: 250,
          minWidth: 250,
        }}
        data-cy="cardSidebar"
      >
        <Box sx={{ marginBottom: 1 }}>
          {renderTableOfContents(
            t('tableOfContents'),
            sanitizedHtml,
            visibleHeaderIds,
          )}
        </Box>
        <Notifications notifications={card.notifications} />
        <PolicyChecks
          policyChecks={card.policyChecks}
          onGoToField={onMetadataUpdate ? setFocusFieldKey : undefined}
        />
      </Stack>
    </Stack>
  );
};

function renderTableOfContents(
  title: string,
  htmlContent: string,
  visibleHeaderIds: string[] | null = null,
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
  const highlightedHeaders = visibleHeaderIds ?? [headers[0]?.id ?? ''];

  return (
    <aside className="contentSidebar toc sidebar">
      <div className="toc-menu" style={{ marginLeft: 2 }}>
        {headers.length > 0 && (
          <Typography level="title-sm" fontWeight="bold">
            {title}
          </Typography>
        )}
        <ul>
          {headers.map(
            (
              header: { id: string; text: string; level: number },
              index: number,
            ) => (
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
            ),
          )}
        </ul>
      </div>
    </aside>
  );
}
