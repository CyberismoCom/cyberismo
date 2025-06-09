/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { useEffect, useState, ReactNode } from 'react';
import { ConfigContext, AppConfig } from './ConfigContext';

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | undefined>(undefined);

  useEffect(() => {
    if (import.meta.env.VITE_CYBERISMO_EXPORT === 'true') {
      setConfig({ staticMode: true });
      return;
    }

    fetch('/config.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load config.json');
        return res.json();
      })
      .then(setConfig)
      .catch((err) => {
        setConfig({ staticMode: false }); // fallback default
        console.error('Failed to load config.json:', err);
      });
  }, []);

  if (!config) {
    // Optionally render a loading spinner or null while loading
    return null;
  }

  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
}
