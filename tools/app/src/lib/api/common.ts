/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import useSWR, { SWRConfiguration } from 'swr';

import { Resources, ResourceName, SwrResult } from './types';
import { useUpdating } from '../hooks';

export function useSWRHook<T extends ResourceName, InitialData = null>(
  swrKey: string | null,
  name: T,
  initialData?: InitialData,
  options?: SWRConfiguration,
) {
  const { data, ...rest } = useSWR<Resources[T]>(swrKey, options);
  const { isUpdating, call } = useUpdating(swrKey);

  return {
    ...rest,
    [name]: data || initialData,
    isUpdating,
    callUpdate: <T>(fn: () => Promise<T>, key2?: string): Promise<T> =>
      call(fn, key2),
  } as unknown as SwrResult<T, InitialData>;
}
