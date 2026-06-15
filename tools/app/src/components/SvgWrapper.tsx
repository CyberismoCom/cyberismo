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
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';

import DownloadIcon from '@mui/icons-material/Download';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';

import SvgViewerModal from '@/components/modals/svgViewerModal';
import { useAppRouter } from '@/lib/hooks';
import { isAppUrl } from '@/lib/utils';

export interface SvgWrapperProps {
  /** The SVG content (already sanitized). */
  children: ReactNode;
  /** Fallback download filename when the SVG has no id. */
  downloadName?: string;
}

const controlButtonStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function serializeSvg(svgEl: SVGSVGElement): string {
  const xml = new XMLSerializer().serializeToString(svgEl);
  return xml.match(/^<svg[^>]+xmlns=/)
    ? xml
    : xml.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/**
 * Wraps an SVG diagram (graph macro, mermaid, ...) with the standard
 * fullscreen/download controls. The controls are React-owned so they are
 * created and removed together with the wrapper during reconciliation.
 */
function SvgWrapper({ children, downloadName }: SvgWrapperProps) {
  // Ref to the diagram content only — the control buttons also contain
  // <svg> icons, so the diagram must be looked up in its own container.
  const contentRef = useRef<HTMLDivElement>(null);
  const [modalSvg, setModalSvg] = useState<string | null>(null);
  const router = useAppRouter();

  const handleFullScreen = () => {
    const svgEl = contentRef.current?.querySelector<SVGSVGElement>('svg');
    if (!svgEl) return;
    setModalSvg(serializeSvg(svgEl));
  };

  const handleDownload = () => {
    const svgEl = contentRef.current?.querySelector<SVGSVGElement>('svg');
    if (!svgEl) return;

    const blob = new Blob([serializeSvg(svgEl)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (svgEl.id || downloadName || 'svg') + ' diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  // Route in-app links inside the SVG through the SPA router. The SVG's
  // <a> elements may use xlink:href, which the content parser does not map
  // to router links.
  const handleLinkClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as Element | null)?.closest?.('a');
    if (!anchor) return;
    const href =
      anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href');
    if (!href || !isAppUrl(href)) return;
    e.preventDefault();
    router.safePush(href);
  };

  return (
    <div
      className="cyberismo-svg-wrapper"
      data-type="cyberismo-svg-wrapper"
      style={{ position: 'relative', paddingTop: 48 }}
      onClick={handleLinkClick}
    >
      <div
        data-cy="svg-controls"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 6,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          aria-label="fullscreen"
          style={controlButtonStyle}
          onClick={handleFullScreen}
        >
          <OpenInFullIcon />
        </button>
        <button
          type="button"
          aria-label="download"
          style={controlButtonStyle}
          onClick={handleDownload}
        >
          <DownloadIcon />
        </button>
      </div>
      <div ref={contentRef}>{children}</div>
      {modalSvg !== null && (
        <SvgViewerModal
          open
          svgMarkup={modalSvg}
          onClose={() => setModalSvg(null)}
        />
      )}
    </div>
  );
}

export default SvgWrapper;
