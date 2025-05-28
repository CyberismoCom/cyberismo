import { createContext, useContext } from 'react';

export type AppConfig = {
  export: boolean;
};

export const ConfigContext = createContext<AppConfig | undefined>(undefined);

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
