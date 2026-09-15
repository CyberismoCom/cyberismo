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

import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { getConfig } from '@/lib/utils';

/**
 * A place for a deployment to add its own UI.
 *
 * Nothing is loaded unless APP_EXTENSION_URL is configured, so a standalone
 * install renders an empty slot and makes no request. `window.cyberismo` is the
 * whole contract: somewhere to draw, and what the user is looking at. It is a
 * published API, so keep it small.
 */
declare global {
  interface Window {
    cyberismo?: {
      version: 1;
      container: HTMLElement;
      project?: string;
      card?: string;
    };
  }
}

/** Dispatched on window whenever the context changes. */
export const EXTENSION_CONTEXT_EVENT = 'cyberismo:context';

let scriptAdded = false;

export default function ExtensionSlot() {
  const { projectPrefix, key } = useParams();
  const container = useRef<HTMLDivElement>(null);
  const url = getConfig().extensionUrl;

  useEffect(() => {
    if (!url || !container.current) return;

    window.cyberismo = {
      version: 1,
      container: container.current,
      project: projectPrefix,
      card: key,
    };
    window.dispatchEvent(new CustomEvent(EXTENSION_CONTEXT_EVENT));

    // Added once per page load, after the context exists, so the script never
    // runs before it can read one.
    if (scriptAdded) return;
    scriptAdded = true;
    const script = document.createElement('script');
    script.src = url;
    // A module, so the deployment can split its script into further chunks
    // without this needing to change. Modules are deferred, so no `async`.
    script.type = 'module';
    // A deployment's own script must not be able to break the app.
    script.onerror = () => console.warn(`extension ${url} did not load`);
    document.head.append(script);
  }, [url, projectPrefix, key]);

  if (!url) return null;
  return <div ref={container} />;
}
