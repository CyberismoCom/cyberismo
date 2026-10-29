// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import SvgWrapper from '@/components/SvgWrapper';
import { useIsDarkMode } from '@/lib/hooks/theme';
import type { MacroContext } from '.';

export interface MermaidProps extends MacroContext {
  code: string;
}

let renderCounter = 0;

const SANITIZE_OPTIONS = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: [
    'foreignObject',
    'div',
    'span',
    'p',
    'br',
    'i',
    'b',
    'em',
    'strong',
    'pre',
    'code',
  ],
  ADD_ATTR: ['class', 'style', 'xmlns', 'requiredExtensions'],
  // Allow HTML content inside <foreignObject> (used by Mermaid for text labels)
  HTML_INTEGRATION_POINTS: { foreignobject: true },
};

function Mermaid({ code }: MermaidProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDarkMode = useIsDarkMode();

  const [prevRender, setPrevRender] = useState({ code, isDarkMode });
  if (code !== prevRender.code || isDarkMode !== prevRender.isDarkMode) {
    setPrevRender({ code, isDarkMode });
    setError(null);
  }

  useEffect(() => {
    if (!code) {
      return;
    }

    let cancelled = false;

    mermaid.initialize({
      startOnLoad: false,
      theme: isDarkMode ? 'dark' : 'default',
      securityLevel: 'strict',
    });
    const id = `mermaid-diagram-${renderCounter++}`;

    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (!cancelled) {
          setSvg(DOMPurify.sanitize(svg, SANITIZE_OPTIONS));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, isDarkMode]);

  if (!code || error) {
    return (
      <div style={{ color: 'red', whiteSpace: 'pre-wrap' }}>
        Mermaid diagram error:{' '}
        {!code ? 'No Mermaid diagram code provided.' : error}
      </div>
    );
  }

  if (!svg) {
    return null;
  }

  return (
    <SvgWrapper>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </SvgWrapper>
  );
}

export default Mermaid;
