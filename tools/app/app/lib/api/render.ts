import { SWRConfiguration } from 'swr';
import { apiPaths, callApi } from '../swr';
import { RenderedContent } from './types';

export const useRender = (key: string | null) => {
  return {
    render: (content: string) => (key && render(key, content)) || null,
  };
};

export async function render(key: string, content: string) {
  const swrKey = apiPaths.render(key);
  return callApi<RenderedContent>(swrKey, 'POST', {
    content,
  });
}
