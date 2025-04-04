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
import { useNavigate } from 'react-router';
import { useEffect } from 'react';
import { createFunctionGuard } from './utils';
import { useTranslation } from 'react-i18next';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

type AppRouter = {
  push: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
  forward: () => void;
  safePush: (path: string) => void;
  safeReplace: (path: string) => void;
  safeBack: () => void;
  safeForward: () => void;
};

/**
 * A hook that returns a router object with additional functionality
 * that prevents navigation when there is edited content on the page
 */
export const useAppRouter = (): AppRouter => {
  const navigate = useNavigate();
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
  }, [isEdited, t]);

  return {
    push: (path: string) => navigate(path),
    replace: (path: string) => navigate(path, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    safePush: isEdited
      ? createFunctionGuard((path: string) => navigate(path), dialogMsg)
      : (path: string) => navigate(path),
    safeReplace: isEdited
      ? createFunctionGuard(
          (path: string) => navigate(path, { replace: true }),
          dialogMsg,
        )
      : (path: string) => navigate(path, { replace: true }),
    safeBack: isEdited
      ? createFunctionGuard(() => navigate(-1), dialogMsg)
      : () => navigate(-1),
    safeForward: isEdited
      ? createFunctionGuard(() => navigate(1), dialogMsg)
      : () => navigate(1),
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
