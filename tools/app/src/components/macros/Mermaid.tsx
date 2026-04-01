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

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import type { MacroContext } from '.';

export interface MermaidProps extends MacroContext {
  code: string;
}

let mermaidInitialized = false;

function ensureMermaidInit() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
  });
  mermaidInitialized = true;
}

let renderCounter = 0;

function Mermaid({ code }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('No Mermaid diagram code provided.');
      return;
    }

    ensureMermaidInit();
    const id = `mermaid-diagram-${renderCounter++}`;

    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (containerRef.current) {
          // Wrap in cyberismo-svg-wrapper so ContentArea's observer
          // adds the standard fullscreen/download controls automatically
          const wrapper = document.createElement('div');
          wrapper.setAttribute('data-type', 'cyberismo-svg-wrapper');
          wrapper.innerHTML = svg;
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(wrapper);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [code]);

  if (error) {
    return (
      <div style={{ color: 'red', whiteSpace: 'pre-wrap' }}>
        Mermaid diagram error: {error}
      </div>
    );
  }

  return <div ref={containerRef} />;
}

export default Mermaid;
