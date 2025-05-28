import { useEffect, useState, ReactNode } from 'react';
import { ConfigContext, AppConfig } from './ConfigContext';

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | undefined>(undefined);

  useEffect(() => {
    fetch('/config.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load config.json');
        return res.json();
      })
      .then(setConfig)
      .catch((err) => {
        setConfig({ export: false }); // fallback default
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
