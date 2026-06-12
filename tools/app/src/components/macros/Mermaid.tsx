/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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

  useEffect(() => {
    if (!code) {
      setError('No Mermaid diagram code provided.');
      return;
    }
    setError(null);

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

  if (error) {
    return (
      <div style={{ color: 'red', whiteSpace: 'pre-wrap' }}>
        Mermaid diagram error: {error}
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
