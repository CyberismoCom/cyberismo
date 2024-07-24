/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useDispatch, useSelector, useStore } from 'react-redux';
import type { RootState, AppDispatch, AppStore } from '../store';
import { setIsUpdating } from '../slices/swr';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

/**
 * A hook that calls isUpdating function automatically
 * @param key - key that identifies the function
 */
export function useUpdating(key: string | null) {
  const dispatch = useAppDispatch();

  return {
    isUpdating: useAppSelector(
      (state) => (key && state.swr.additionalProps[key]?.isUpdating) || false,
    ),
    call: async <T>(fn: () => Promise<T>) => {
      if (!key) {
        return;
      }
      dispatch(setIsUpdating({ key, isUpdating: true }));
      try {
        return await fn();
      } finally {
        dispatch(setIsUpdating({ key, isUpdating: false }));
      }
    },
  };
}
