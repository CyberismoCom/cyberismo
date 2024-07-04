import { useSWRHook } from './common';
import { apiPaths } from '../swr';

import { SWRConfiguration } from 'swr';

export const useProject = (options?: SWRConfiguration) =>
  useSWRHook<'project'>(apiPaths.project(), 'project', options);
