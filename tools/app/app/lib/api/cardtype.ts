import { useSWRHook } from './common';
import { apiPaths } from '../swr';

import { SWRConfiguration } from 'swr';

export const useCardType = (key: string | null, options?: SWRConfiguration) =>
  useSWRHook<'cardType'>(
    key ? apiPaths.cardType(key) : null,
    'cardType',
    options,
  );
