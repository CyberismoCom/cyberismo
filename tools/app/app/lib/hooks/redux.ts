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
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createFunctionGuard } from './utils';
import { useTranslation } from 'react-i18next';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

// make args with boolean at the end
type AppRouter = ReturnType<typeof useRouter> & {
  safePush: ReturnType<typeof useRouter>['push'];
  safeReplace: ReturnType<typeof useRouter>['replace'];
  safeRefresh: ReturnType<typeof useRouter>['refresh'];
  safeBack: ReturnType<typeof useRouter>['back'];
  safeForward: ReturnType<typeof useRouter>['forward'];
};

/**
 * A hook that returns a router object with additional functionality
 * that prevents navigation when there is edited content on the page
 */
export const useAppRouter = (): AppRouter => {
  const router = useRouter();
  const isEdited = useAppSelector((state) => state.page.isEdited);
  const { t } = useTranslation();

  const dialogMsg = t('navigationDialogMsg');

  useEffect(() => {
    if (isEdited) {
      const handleUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = t('beforeUnload'); // for legacy browsers
      };
      window.addEventListener('beforeunload', handleUnload);
      return () => {
        window.removeEventListener('beforeunload', handleUnload);
      };
    }
  }, [isEdited]);

  return {
    ...router,
    safePush: isEdited
      ? createFunctionGuard(router.push, dialogMsg)
      : router.push,
    safeReplace: isEdited
      ? createFunctionGuard(router.replace, dialogMsg)
      : router.replace,
    safeRefresh: isEdited
      ? createFunctionGuard(router.refresh, dialogMsg)
      : router.refresh,
    safeBack: isEdited
      ? createFunctionGuard(router.back, dialogMsg)
      : router.back,
    safeForward: isEdited
      ? createFunctionGuard(router.forward, dialogMsg)
      : router.forward,
  };
};

/**
 * A hook that calls isUpdating function automatically
 * @param key - key that identifies the function
 */
export function useUpdating(key: string | null) {
  const dispatch = useAppDispatch();

  return {
    isUpdating: useAppSelector(
      (state) => state.swr.additionalProps[key ?? 'root']?.isUpdating ?? false,
    ),
    call: async <T>(fn: () => Promise<T>) => {
      dispatch(setIsUpdating({ key: key ?? 'root', isUpdating: true }));
      try {
        return await fn();
      } finally {
        dispatch(setIsUpdating({ key: key ?? 'root', isUpdating: false }));
      }
    },
  };
}
